const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  ARCHIVE_DIR,
  DB_FILE,
  OPERATION_DB_FILE,
  OPERATION_LOG_DIR,
  REMARK_IMAGE_DIR,
  UPLOAD_DIR,
} = require("./config");
const { sendError, sendJson } = require("./http-utils");
const { requireUser } = require("./auth");
const { canRunMaintenance, canViewOperationLogs } = require("./permissions");
const { exportOperationLogTxtForDate } = require("./operation-log-archive");
const { readDb, writeDb } = require("./storage");
const {
  insertMaintenanceRecord,
  insertOperationLog,
  listLogArchiveRecords,
  listMaintenanceRecords,
  listOperationLogs,
} = require("./repositories/system-repo");

function handleMaintenanceSummary(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!canRunMaintenance(user)) return sendError(res, 403, "只有管理员可以查看系统维护");
  const db = readDb();
  const missingFiles = findMissingFiles(db);
  const orphanFiles = findOrphanFiles(db);
  sendJson(res, 200, {
    summary: {
      appDbSize: fileSize(DB_FILE),
      operationDbSize: fileSize(OPERATION_DB_FILE),
      uploadDirSize: directorySize(UPLOAD_DIR),
      archiveDirSize: directorySize(ARCHIVE_DIR),
      operationLogDirSize: directorySize(OPERATION_LOG_DIR),
      fileRecords: db.files.length,
      missingFiles: missingFiles.length,
      orphanFiles: orphanFiles.length,
    },
    recentMaintenance: listMaintenanceRecords(),
    logArchives: listLogArchiveRecords(),
  });
}

function handleScanMissingFiles(req, res) {
  const user = requireMaintenanceUser(req, res);
  if (!user) return;
  const missingFiles = findMissingFiles(readDb());
  insertMaintenanceRecord({
    action: "maintenance.scan_missing_files",
    status: "ok",
    detail: `missing=${missingFiles.length}`,
  });
  sendJson(res, 200, { missingFiles });
}

function handleCleanMissingFiles(req, res) {
  const user = requireMaintenanceUser(req, res);
  if (!user) return;
  const db = readDb();
  const missingFiles = findMissingFiles(db);
  const missingIds = new Set(missingFiles.map((file) => file.id));
  db.files = db.files.filter((file) => !missingIds.has(file.id));
  db.tasks.forEach((task) => {
    task.attachments = (task.attachments || []).filter((fileId) => !missingIds.has(fileId));
  });
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "maintenance.clean_missing_files",
    targetType: "file",
    detail: `count=${missingFiles.length}`,
  });
  insertMaintenanceRecord({
    action: "maintenance.clean_missing_files",
    status: "ok",
    detail: `cleaned=${missingFiles.length}`,
  });
  sendJson(res, 200, { cleaned: missingFiles.length });
}

function handleScanOrphanFiles(req, res) {
  const user = requireMaintenanceUser(req, res);
  if (!user) return;
  const orphanFiles = findOrphanFiles(readDb());
  insertMaintenanceRecord({
    action: "maintenance.scan_orphan_files",
    status: "ok",
    detail: `orphan=${orphanFiles.length}`,
  });
  sendJson(res, 200, { orphanFiles });
}

function handleArchiveOperationLogs(req, res) {
  const user = requireMaintenanceUser(req, res);
  if (!user) return;
  const date = new URL(req.url, `http://${req.headers.host}`).searchParams.get("date") || previousLocalDateString();
  const archivePath = exportOperationLogTxtForDate(date);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "operation_logs.archive.manual",
    targetType: "operation_log",
    targetId: date,
    detail: archivePath || "already_archived",
  });
  sendJson(res, 200, { archivePath, alreadyArchived: !archivePath });
}

function handleOperationLogs(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!canViewOperationLogs(user)) return sendError(res, 403, "只有管理员可以查看操作记录");
  const url = new URL(req.url, `http://${req.headers.host}`);
  sendJson(res, 200, {
    logs: listOperationLogs({
      keyword: url.searchParams.get("keyword") || "",
      action: url.searchParams.get("action") || "",
    }),
  });
}

function requireMaintenanceUser(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!canRunMaintenance(user)) {
    sendError(res, 403, "只有管理员可以执行系统维护");
    return null;
  }
  return user;
}

function findMissingFiles(db) {
  return db.files
    .map((file) => ({ ...file, realPath: storedPath(file) }))
    .filter((file) => !fs.existsSync(file.realPath));
}

function findOrphanFiles(db) {
  const knownPaths = new Set(db.files.map((file) => path.resolve(storedPath(file)).toLowerCase()));
  return listFilesUnder(UPLOAD_DIR)
    .filter((filePath) => !knownPaths.has(path.resolve(filePath).toLowerCase()))
    .map((filePath) => ({
      path: filePath,
      size: fileSize(filePath),
      updatedAt: fs.statSync(filePath).mtime.toISOString(),
    }));
}

function storedPath(file) {
  const baseDir = file.storageArea === "remarkImage" ? REMARK_IMAGE_DIR : UPLOAD_DIR;
  return path.join(baseDir, file.relativePath || file.storedName);
}

function listFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFilesUnder(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

function directorySize(dir) {
  return listFilesUnder(dir).reduce((sum, filePath) => sum + fileSize(filePath), 0);
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function previousLocalDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateString(date);
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

module.exports = {
  handleArchiveOperationLogs,
  handleCleanMissingFiles,
  handleMaintenanceSummary,
  handleOperationLogs,
  handleScanMissingFiles,
  handleScanOrphanFiles,
};
