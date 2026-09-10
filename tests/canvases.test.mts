import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'pithagoras-canvas-test-'));
const {getDb}=await import('../server/src/db.js');
const {CanvasTools,canvasWritePrefix}=await import('../server/src/pi/canvas-tools.js');
const {readCanvas,editCanvas,listCanvases}=await import('../server/src/canvases.js');
getDb().prepare('INSERT INTO sessions (id,title,workspace) VALUES (?,?,?)').run('s1','test','/tmp');
getDb().prepare('INSERT INTO sessions (id,title,workspace) VALUES (?,?,?)').run('s2','other','/tmp');
function setup(){const controller=new CanvasTools('s1');const tools:Record<string,any>={};controller.extension({registerTool:(t:any)=>tools[t.name]=t});return {controller,tools};}
const value=(r:any)=>{assert.equal(r.isError,false,r.output);return JSON.parse(r.output)};
function delta(controller:any,id:string,raw:string){controller.observe({type:'message_update',assistantMessageEvent:{type:'toolcall_delta',contentIndex:0,delta:raw,partial:{content:[{type:'toolCall',name:'canvas_write',id}]}}});}
test('partial JSON decoder preserves escapes and does not invent incomplete Unicode',()=>{
 assert.deepEqual(canvasWritePrefix('{"canvas_id":"abc","revision":0,"operation":"replace","content":"hello\\nworld\\u26'),{canvas_id:'abc',revision:0,operation:'replace',content:'hello\nworld'});
 assert.equal(canvasWritePrefix('{"canvas_id":"abc') ,undefined);
 assert.equal(canvasWritePrefix('{"canvas_id":"abc","revision":0,"operation":"append","content":"quote: \\" yes')?.content,'quote: " yes');
});
test('streamed content is in SQLite before execution and survives interruption; appending does not duplicate',async()=>{
 const {controller,tools}=setup();const row=value(await tools.canvas_create.execute('create',{title:'Document'}));
 delta(controller,'write',`{"canvas_id":"${row.id}","revision":0,"operation":"replace","content":"First`);
 assert.equal(readCanvas('s1',row.id).content,'First');assert.equal(readCanvas('s1',row.id).status,'writing');
 delta(controller,'write',' line\\nSecond');controller.interrupt();
 let saved=readCanvas('s1',row.id);assert.equal(saved.content,'First line\nSecond');assert.equal(saved.status,'interrupted');assert.equal(saved.active_call,null);
 saved=value(await tools.canvas_read.execute('read',{canvas_id:row.id}));
 const args={canvas_id:row.id,revision:saved.revision,operation:'append',content:' paragraph.'};
 delta(controller,'append',JSON.stringify(args));value(await tools.canvas_write.execute('append',args));
 assert.equal(readCanvas('s1',row.id).content,'First line\nSecond paragraph.');
});
test('manual edits require a new read, even if the AI guesses the latest revision',async()=>{
 const {controller,tools}=setup();let row=value(await tools.canvas_create.execute('create',{title:'Human edits'}));
 row=editCanvas('s1',row.id,row.revision,row.title,'Human words');assert.equal(row.status,'edited');
 const args={canvas_id:row.id,revision:row.revision,operation:'replace',content:'AI words'};
 const stale=await tools.canvas_write.execute('stale',args);assert.equal(stale.isError,true);assert.match(stale.output,/Read this canvas/);
 assert.equal(readCanvas('s1',row.id).content,'Human words');
 value(await tools.canvas_read.execute('read',{canvas_id:row.id}));value(await tools.canvas_write.execute('fresh',args));assert.equal(readCanvas('s1',row.id).content,'AI words');
 controller.interrupt();
});
test('session scope and revision checks protect other documents and active writes',async()=>{
 const {controller,tools}=setup();const row=value(await tools.canvas_create.execute('create',{title:'Scoped'}));
 assert.throws(()=>readCanvas('s2',row.id),/not found/);assert.equal(listCanvases('s2').length,0);
 delta(controller,'write',`{"canvas_id":"${row.id}","revision":0,"operation":"replace","content":"draft`);
 assert.throws(()=>editCanvas('s1',row.id,1,'Scoped','clobber'),/being written/);
 controller.observe({type:'message_end',message:{stopReason:'aborted'}});
 assert.equal(readCanvas('s1',row.id).status,'interrupted');
 const current=readCanvas('s1',row.id);value(await tools.canvas_delete.execute('delete',{canvas_id:row.id,revision:current.revision}));assert.throws(()=>readCanvas('s1',row.id),/not found/);
});
test('AI can continue its own edits without rereading, including in a resumed controller',async()=>{
 const {tools}=setup();const row=value(await tools.canvas_create.execute('create',{title:'Continue'}));
 const first=value(await tools.canvas_write.execute('one',{canvas_id:row.id,revision:0,operation:'replace',content:'One'}));
 const second=value(await tools.canvas_write.execute('two',{canvas_id:row.id,revision:first.revision,operation:'append',content:' two'}));
 const resumed=setup();value(await resumed.tools.canvas_write.execute('three',{canvas_id:row.id,revision:second.revision,operation:'append',content:' three'}));
 assert.equal(readCanvas('s1',row.id).content,'One two three');
});
