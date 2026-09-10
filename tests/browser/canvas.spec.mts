import { test,expect } from '@playwright/test';
test('canvas streams on the stage, retains a partial draft and supports inline edits and deletion',async({page})=>{
 const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
 await page.route('**/api/browser',r=>r.fulfill({json:{running:false,install:{container:'stopped'},sessions:[]}}));
 await page.route('**/api/voice',r=>r.fulfill({json:{enabled:false}}));
 await page.route('**/api/sessions/test/commands',r=>r.fulfill({json:{commands:[]}}));
 await page.route('**/api/sessions/test/config',r=>r.fulfill({status:503,json:{}}));
 await page.addInitScript(()=>{
   class FakeEvents {onmessage:any;onopen:any;onerror:any;constructor(){(window as any).canvasStream=this;setTimeout(()=>{this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'snapshot',canvases:[]})});(window as any).canvasStreamReady=true},100)}close(){}}
   (window as any).EventSource=FakeEvents;
 });
 let row={id:'canvas-1',title:'A live document',content:'',revision:0,status:'writing',active_call:'call-1',updated_at:''};
 await page.route('**/api/sessions/test/canvases/canvas-1',async route=>{
   if(route.request().method()==='DELETE')return route.fulfill({json:{ok:true}});
   const body=route.request().postDataJSON();expect(body.revision).toBe(row.revision);row={...row,...body,revision:row.revision+1,status:'edited',active_call:null as any};return route.fulfill({json:row});
 });
 await page.goto('/tests/voice.html');
 await expect(page.getByLabel('Session canvases')).toBeVisible();
 await page.waitForFunction(()=>(window as any).canvasStreamReady);
 const emit=async()=>page.evaluate(row=>(window as any).canvasStream.onmessage({data:JSON.stringify({type:'update',canvas:row})}),row);
 row.content='# A live document\n\nThe first sentence.';row.revision=1;await emit();
 await expect(page.getByLabel('Session canvas workspace')).toBeVisible();
 await expect(page.locator('.canvas-document')).toContainText('The first sentence.');
 await expect(page.getByRole('button',{name:'Edit inline'})).toBeDisabled();
 row.content+=' Another sentence appears.';row.revision=2;await emit();
 await expect(page.locator('.canvas-document')).toContainText('Another sentence appears.');
 row.status='interrupted';row.active_call=null as any;await emit();
 await expect(page.getByText('Partial draft saved',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Edit inline'}).click();
 await page.getByLabel('Edit canvas content').fill('My own edited document.');
 await page.getByLabel('Canvas title').fill('Human revision');
 await page.getByRole('button',{name:'Save changes'}).click();
 await expect(page.locator('.canvas-document')).toContainText('My own edited document.');
 await expect(page.getByText('Edited by you',{exact:false})).toBeVisible();
 await page.getByTestId('workspace').screenshot({path:'/tmp/pithagoras-canvas.png'});
 await page.setViewportSize({width:390,height:844});
 await page.getByTestId('workspace').screenshot({path:'/tmp/pithagoras-canvas-mobile.png'});
 const box=await page.getByLabel('Session canvas workspace').boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
 await page.getByLabel('Delete canvas').click();await page.getByRole('button',{name:'Delete',exact:true}).click();
 await expect(page.getByText('A place for your documents')).toBeVisible();expect(failures).toEqual([]);
});
