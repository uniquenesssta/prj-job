const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const {
  ARCHIVE_DIR,
  DATA_DIR,
  DB_FILE,
  REMARK_IMAGE_DIR,
  UPLOAD_DIR,
} = require("./config");

let sqlite = null;

function ensureDatabase() {
  ensureDirectory(DATA_DIR);
  ensureDirectory(UPLOAD_DIR);
  ensureDirectory(REMARK_IMAGE_DIR);
  ensureDirectory(ARCHIVE_DIR);
  const db = getDatabase();
  createSchema(db);
  createIndexes(db);
  return db;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getDatabase() {
  if (!sqlite) {
    sqlite = new DatabaseSync(DB_FILE);
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
  return sqlite;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      passwordHash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      wechat TEXT NOT NULL DEFAULT '',
      orderNo TEXT NOT NULL DEFAULT '',
      taobaoId TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      remarkRecords TEXT NOT NULL DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'public',
      creatorId TEXT NOT NULL,
      assigneeId TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'todo',
      progress INTEGER NOT NULL DEFAULT 0,
      dueDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      archivedAt TEXT NOT NULL DEFAULT '',
      archiveZipPath TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      originalName TEXT NOT NULL,
      storedName TEXT NOT NULL,
      relativePath TEXT NOT NULL,
      folderName TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL DEFAULT 'application/octet-stream',
      storageArea TEXT NOT NULL DEFAULT 'upload',
      usage TEXT NOT NULL DEFAULT 'attachment',
      uploadedBy TEXT NOT NULL,
      uploadedByName TEXT NOT NULL DEFAULT '',
      uploadedByRole TEXT NOT NULL DEFAULT '',
      uploadedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_attachments (
      taskId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (taskId, fileId)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      authorId TEXT NOT NULL,
      text TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_notes (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      userId TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL,
      UNIQUE(taskId, userId)
    );
  `);
}

function createIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigneeId);
    CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creatorId);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(dueDate);
    CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON tasks(visibility);
    CREATE INDEX IF NOT EXISTS idx_files_task ON files(taskId);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(taskId);
    CREATE INDEX IF NOT EXISTS idx_personal_notes_task_user ON personal_notes(taskId, userId);
  `);
}

function isDatabaseEmpty(db = getDatabase()) {
  return Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count) === 0;
}

function clearApplicationData(db = getDatabase()) {
  db.exec("DELETE FROM personal_notes; DELETE FROM comments; DELETE FROM task_attachments; DELETE FROM files; DELETE FROM tasks; DELETE FROM users;");
}

function clearCoreData(db = getDatabase()) {
  db.exec("DELETE FROM task_attachments; DELETE FROM files; DELETE FROM tasks; DELETE FROM users;");
}

function runInTransaction(callback, db = getDatabase()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  clearApplicationData,
  clearCoreData,
  ensureDatabase,
  getDatabase,
  isDatabaseEmpty,
  runInTransaction,
};
