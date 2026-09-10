import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { getDb } from './db.js';

export interface CanvasRow { id: string; session_id: string; title: string; content: string; revision: number; status: string; active_call: string | null; agent_read_revision: number | null; updated_at: string }
export const canvasEvents = new EventEmitter();
canvasEvents.setMaxListeners(0);
export function listCanvases(session: string): CanvasRow[] { return getDb().prepare('SELECT * FROM canvases WHERE session_id = ? ORDER BY updated_at DESC').all(session) as CanvasRow[]; }
export function readCanvas(session: string, id: string): CanvasRow {
  const row = getDb().prepare('SELECT * FROM canvases WHERE session_id = ? AND id = ?').get(session, id) as CanvasRow | undefined;
  if (!row) throw new Error('Canvas not found in this session');
  return row;
}
function notify(row: CanvasRow) { canvasEvents.emit(row.session_id, { type: 'update', canvas: row }); return row; }
export function createCanvas(session: string, title: string): CanvasRow {
  if (!getDb().prepare('SELECT id FROM sessions WHERE id = ?').get(session)) throw new Error('Session not found');
  if (!title.trim() || title.length > 200) throw new Error('Title must contain 1–200 characters');
  const id = nanoid();
  getDb().prepare('INSERT INTO canvases (id, session_id, title) VALUES (?, ?, ?)').run(id, session, title.trim());
  return notify(readCanvas(session,id));
}
export function editCanvas(session: string, id: string, revision: number, title: string, content: string): CanvasRow {
  if (!title.trim() || title.length > 200 || content.length > 1_000_000) throw new Error('Invalid canvas title or content size');
  const row = readCanvas(session,id);
  if (row.active_call || row.revision !== revision) throw new Error('Canvas changed or is being written. Reload before editing.');
  getDb().prepare("UPDATE canvases SET title = ?, content = ?, revision = revision + 1, status = 'edited', updated_at = ? WHERE id = ? AND session_id = ?").run(title.trim(),content,new Date().toISOString(),id,session);
  return notify(readCanvas(session,id));
}
export function deleteCanvas(session: string,id: string,revision: number) {
  const row=readCanvas(session,id);
  if(row.active_call || row.revision!==revision) throw new Error('Canvas changed or is being written. Reload before deleting.');
  getDb().prepare('DELETE FROM canvases WHERE id = ? AND session_id = ?').run(id,session);
  canvasEvents.emit(session,{type:'delete',id});
}
export function markCanvasRead(session:string,id:string): CanvasRow {
  const row=readCanvas(session,id);
  getDb().prepare('UPDATE canvases SET agent_read_revision = revision WHERE id = ? AND session_id = ?').run(id,session);
  return readCanvas(session,id);
}
export function beginCanvasWrite(session: string,id: string,revision: number,call: string): CanvasRow {
  const row=readCanvas(session,id);
  if(row.agent_read_revision!==row.revision) throw new Error('Read this canvas with canvas_read before editing; it is unread or was edited by the user.');
  if(row.active_call || row.revision!==revision) throw new Error('Canvas changed or is being written. Use its current revision.');
  getDb().prepare("UPDATE canvases SET active_call = ?, status = 'writing' WHERE id = ? AND session_id = ?").run(call,id,session);
  return notify(readCanvas(session,id));
}
export function saveCanvasPrefix(session: string,id: string,call: string,content: string): CanvasRow {
  if(content.length>1_000_000) throw new Error('Canvas exceeds one million characters');
  const row=readCanvas(session,id);
  if(row.active_call!==call) throw new Error('Canvas write is no longer active');
  if(row.content===content) return row;
  getDb().prepare('UPDATE canvases SET content = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND session_id = ?').run(content,new Date().toISOString(),id,session);
  return notify(readCanvas(session,id));
}
export function finishCanvasWrite(session: string,id: string,call: string,interrupted: boolean) {
  const changed=getDb().prepare('UPDATE canvases SET active_call = NULL, agent_read_revision = revision, status = ?, updated_at = ? WHERE session_id = ? AND id = ? AND active_call = ?').run(interrupted?'interrupted':'saved',new Date().toISOString(),session,id,call);
  if(changed.changes) return notify(readCanvas(session,id));
}
