const { getDatabase } = require("../database");

function listFiles(db = getDatabase()) {
  return db.prepare("SELECT * FROM files ORDER BY uploadedAt, rowid").all().map(normalizeFile);
}

function insertFiles(files, db = getDatabase()) {
  const insert = db.prepare(`
    INSERT INTO files (
      id, taskId, originalName, storedName, relativePath, folderName, size, mimeType,
      storageArea, usage, uploadedBy, uploadedByName, uploadedByRole, uploadedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (files || []).forEach((file) => {
    insert.run(
      file.id,
      file.taskId,
      file.originalName,
      file.storedName,
      file.relativePath || file.storedName,
      file.folderName || "",
      Number(file.size || 0),
      file.mimeType || "application/octet-stream",
      file.storageArea || "upload",
      file.usage || "attachment",
      file.uploadedBy,
      file.uploadedByName || "",
      file.uploadedByRole || "",
      file.uploadedAt || new Date().toISOString()
    );
  });
}

function normalizeFile(file) {
  return {
    ...file,
    size: Number(file.size || 0),
    usage: normalizeFileUsage(file.usage),
  };
}

function normalizeFileUsage(value) {
  const usage = String(value || "").trim();
  return ["material", "reference", "draft", "final", "source", "other", "remark"].includes(usage) ? usage : "other";
}

module.exports = {
  insertFiles,
  listFiles,
};
