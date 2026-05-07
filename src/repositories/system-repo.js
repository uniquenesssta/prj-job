const { createDatabaseId, getDatabase, getOperationDatabase } = require("../database");

function listDepartments(db = getDatabase()) {
  return db.prepare("SELECT * FROM departments ORDER BY rowid").all();
}

function listPermissions(db = getDatabase()) {
  return db.prepare("SELECT * FROM permissions ORDER BY groupName, rowid").all();
}

function listRolePermissions(db = getDatabase()) {
  return db.prepare(`
    SELECT rp.role, p.code, p.name, p.groupName
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permissionId
    ORDER BY rp.role, p.groupName, p.rowid
  `).all();
}

function listTaskStatuses(db = getDatabase()) {
  return db.prepare("SELECT * FROM task_statuses ORDER BY sortOrder, rowid").all();
}

function listTaskFieldDefinitions(db = getDatabase()) {
  return db.prepare("SELECT * FROM task_field_definitions ORDER BY sortOrder, rowid").all();
}

function insertOperationLog(entry, db = getOperationDatabase()) {
  const record = normalizeOperationLog(entry);
  db.prepare(`
    INSERT INTO operation_logs (id, userId, userName, action, targetType, targetId, detail, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.userId,
    record.userName,
    record.action,
    record.targetType,
    record.targetId,
    record.detail,
    record.createdAt
  );
}

function insertArchiveRecord(record, db = getDatabase()) {
  const nextRecord = {
    id: record.id || createDatabaseId("archive"),
    taskId: record.taskId,
    archivePath: record.archivePath || "",
    zipPath: record.zipPath || "",
    archivedBy: record.archivedBy || "",
    archivedByName: record.archivedByName || "",
    archivedAt: record.archivedAt || new Date().toISOString(),
    taskSnapshot: JSON.stringify(record.taskSnapshot || {}),
    fileCount: Number(record.fileCount || 0),
    commentCount: Number(record.commentCount || 0),
  };
  db.prepare(`
    INSERT INTO archive_records (
      id, taskId, archivePath, zipPath, archivedBy, archivedByName, archivedAt,
      taskSnapshot, fileCount, commentCount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextRecord.id,
    nextRecord.taskId,
    nextRecord.archivePath,
    nextRecord.zipPath,
    nextRecord.archivedBy,
    nextRecord.archivedByName,
    nextRecord.archivedAt,
    nextRecord.taskSnapshot,
    nextRecord.fileCount,
    nextRecord.commentCount
  );
}

function markArchiveRecordRestored(taskId, restoredAt = new Date().toISOString(), db = getDatabase()) {
  db.prepare(`
    UPDATE archive_records
    SET restoredAt = ?
    WHERE taskId = ? AND restoredAt = ''
  `).run(restoredAt, taskId);
}

function insertMaintenanceRecord(entry, db = getOperationDatabase()) {
  const record = {
    id: entry.id || createDatabaseId("maint"),
    action: entry.action || "",
    status: entry.status || "ok",
    detail: entry.detail || "",
    createdAt: entry.createdAt || new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO maintenance_records (id, action, status, detail, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.action,
    record.status,
    record.detail,
    record.createdAt
  );
}

function insertLogArchiveRecord(record, db = getOperationDatabase()) {
  db.prepare(`
    INSERT OR IGNORE INTO log_archive_records (id, archiveDate, archivePath, recordCount, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    record.id || createDatabaseId("logarchive"),
    record.archiveDate || "",
    record.archivePath || "",
    Number(record.recordCount || 0),
    record.createdAt || new Date().toISOString()
  );
}

function normalizeOperationLog(entry) {
  return {
    id: entry.id || createDatabaseId("op"),
    userId: entry.userId || "",
    userName: entry.userName || "",
    action: entry.action || "",
    targetType: entry.targetType || "",
    targetId: entry.targetId || "",
    detail: entry.detail || "",
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

module.exports = {
  insertArchiveRecord,
  insertLogArchiveRecord,
  insertMaintenanceRecord,
  insertOperationLog,
  listDepartments,
  listPermissions,
  listRolePermissions,
  listTaskFieldDefinitions,
  listTaskStatuses,
  markArchiveRecordRestored,
};
