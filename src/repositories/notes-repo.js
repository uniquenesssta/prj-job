const { getDatabase } = require("../database");

function listPersonalNotes(db = getDatabase()) {
  return db.prepare("SELECT * FROM personal_notes ORDER BY updatedAt, rowid").all();
}

function upsertPersonalNote(note, db = getDatabase()) {
  db.prepare(`
    INSERT INTO personal_notes (id, taskId, userId, text, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(taskId, userId) DO UPDATE SET
      text = excluded.text,
      updatedAt = excluded.updatedAt
  `).run(note.id, note.taskId, note.userId, note.text || "", note.updatedAt || new Date().toISOString());
}

module.exports = {
  listPersonalNotes,
  upsertPersonalNote,
};
