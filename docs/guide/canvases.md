# Session canvases

A canvas is a document saved with a conversation. Open **Canvases** to browse,
read, create, edit inline, or delete the session's documents. The same panel
works during chat and voice mode. Documents can contain plain text or Markdown.

Ask the agent to create a canvas and write into it. The text appears live while
its write arguments stream, rather than waiting for the entire tool call.
Decoded text is persisted to SQLite as it arrives. If interrupted, the current
text remains as a **Partial draft saved**; incomplete JSON escapes are not
invented. A server restart also releases unfinished writes as partial drafts.

Choose **Edit inline**, make changes in the same panel, and **Save changes**.
Your save marks the canvas **Edited by you**. The AI must read it before making
its next change. It can continue its own edits without rereading; an unread
canvas also requires an initial read. Revisions prevent stale edits from
silently overwriting newer text. While an AI write is streaming, finish or
interrupt it before editing manually. A conflicting manual draft stays in the
editor so you can copy it before reloading the document.

The agent has five tools: `canvas_create`, `canvas_list`, `canvas_read`,
`canvas_write` (replace or append), and `canvas_delete`. Write arguments specify
the document and revision before the content so live writes have an unambiguous
target. No content is guessed to complete an interrupted call.

At most two work panels are visible alongside the orb. Opening a third minimizes
the least recently opened panel. On desktop, a single work panel sits on the
right with the full orb on the left. Two panels use the compact orb dock below;
the canvas gets more width than the terminal. Minimizing a document does not
remove it or discard an unsaved edit.

Canvases live in the `canvases` table of the existing session database and are
removed when their owning session is deleted. Include `portal.db` in backups.
