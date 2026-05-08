const { getDatabase } = require("../database");

function listPersonalNotes(db = getDatabase()) {
  return db.prepare("SELECT * FROM personal_notes ORDER BY createdAt, rowid").all().map(normalizePersonalNote);
}

function listPersonalNotesForTask(taskId, db = getDatabase()) {
  return db.prepare("SELECT * FROM personal_notes WHERE taskId = ? ORDER BY createdAt, rowid").all(taskId).map(normalizePersonalNote);
}

function listPersonalNotesForUserTask(userId, taskId, db = getDatabase()) {
  return db.prepare("SELECT * FROM personal_notes WHERE userId = ? AND taskId = ? ORDER BY createdAt, rowid").all(userId, taskId).map(normalizePersonalNote);
}

function insertPersonalNote(note, db = getDatabase()) {
  db.prepare(`
    INSERT INTO personal_notes (id, taskId, userId, text, imageFileIds, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    note.id,
    note.taskId,
    note.userId,
    note.text || "",
    JSON.stringify(Array.isArray(note.imageFileIds) ? note.imageFileIds : []),
    note.createdAt || new Date().toISOString()
  );
}

function deletePersonalNoteForUser(noteId, userId, taskId, db = getDatabase()) {
  const note = db.prepare("SELECT * FROM personal_notes WHERE id = ? AND userId = ? AND taskId = ?").get(noteId, userId, taskId);
  if (!note) return null;
  db.prepare("DELETE FROM personal_notes WHERE id = ?").run(noteId);
  return normalizePersonalNote(note);
}

function removeFileIdFromPersonalNotes(fileId, db = getDatabase()) {
  const target = String(fileId || "");
  if (!target) return 0;
  const rows = db.prepare("SELECT id, imageFileIds FROM personal_notes").all();
  const update = db.prepare("UPDATE personal_notes SET imageFileIds = ? WHERE id = ?");
  let changed = 0;
  rows.forEach((row) => {
    const imageFileIds = parseJsonArray(row.imageFileIds);
    if (!imageFileIds.includes(target)) return;
    update.run(JSON.stringify(imageFileIds.filter((id) => id !== target)), row.id);
    changed += 1;
  });
  return changed;
}

function normalizePersonalNote(note) {
  return {
    ...note,
    imageFileIds: parseJsonArray(note.imageFileIds),
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  deletePersonalNoteForUser,
  insertPersonalNote,
  listPersonalNotesForTask,
  listPersonalNotesForUserTask,
  listPersonalNotes,
  removeFileIdFromPersonalNotes,
};
