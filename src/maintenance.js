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
const { getDatabase, getOperationDatabase } = require("./database");
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

const statusText = {
  todo: "待开始",
  doing: "进行中",
  review: "待审核",
  done: "已完成",
  blocked: "受阻",
};

const fileUsageText = {
  material: "客户资料",
  reference: "参考图",
  draft: "设计初稿",
  final: "设计终稿",
  source: "源文件",
  other: "附件",
  remark: "备注图片",
};

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
      appWalSize: fileSize(`${DB_FILE}-wal`),
      appShmSize: fileSize(`${DB_FILE}-shm`),
      operationDbSize: fileSize(OPERATION_DB_FILE),
      operationWalSize: fileSize(`${OPERATION_DB_FILE}-wal`),
      operationShmSize: fileSize(`${OPERATION_DB_FILE}-shm`),
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
  const archiveResult = exportOperationLogTxtForDate(date, { retentionDays: 30 });
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "operation_logs.archive.manual",
    targetType: "operation_log",
    targetId: date,
    detail: JSON.stringify({
      archiveDir: archiveResult.archiveDir,
      alreadyArchived: archiveResult.alreadyArchived,
      operationCount: archiveResult.operationCount,
      maintenanceCount: archiveResult.maintenanceCount,
      pruned: archiveResult.pruned,
    }),
  });
  sendJson(res, 200, {
    archivePath: archiveResult.archiveDir,
    archiveDir: archiveResult.archiveDir,
    files: archiveResult.files,
    alreadyArchived: archiveResult.alreadyArchived,
    operationCount: archiveResult.operationCount,
    maintenanceCount: archiveResult.maintenanceCount,
    pruned: archiveResult.pruned,
  });
}

function handleCompactDatabases(req, res) {
  const user = requireMaintenanceUser(req, res);
  if (!user) return;

  const before = databaseSizeSnapshot();
  try {
    compactDatabaseConnection(getDatabase());
    compactDatabaseConnection(getOperationDatabase());
    const after = databaseSizeSnapshot();
    const detail = JSON.stringify({ before, after });
    insertOperationLog({
      userId: user.id,
      userName: user.name,
      action: "maintenance.compact_databases",
      targetType: "database",
      detail,
    });
    insertMaintenanceRecord({
      action: "maintenance.compact_databases",
      status: "ok",
      detail,
    });
    sendJson(res, 200, {
      ok: true,
      message: "数据库整理完成，WAL 日志已尝试合并并截断。",
      before,
      after,
    });
  } catch (error) {
    insertMaintenanceRecord({
      action: "maintenance.compact_databases",
      status: "error",
      detail: error.message || "数据库整理失败",
    });
    sendError(res, 500, `数据库整理失败：${error.message || "未知错误"}`);
  }
}

function compactDatabaseConnection(db) {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("PRAGMA optimize");
}

function databaseSizeSnapshot() {
  return {
    appDbSize: fileSize(DB_FILE),
    appWalSize: fileSize(`${DB_FILE}-wal`),
    appShmSize: fileSize(`${DB_FILE}-shm`),
    operationDbSize: fileSize(OPERATION_DB_FILE),
    operationWalSize: fileSize(`${OPERATION_DB_FILE}-wal`),
    operationShmSize: fileSize(`${OPERATION_DB_FILE}-shm`),
  };
}

function handleOperationLogs(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!canViewOperationLogs(user)) return sendError(res, 403, "只有管理员可以查看操作记录");
  const url = new URL(req.url, `http://${req.headers.host}`);
  const keyword = String(url.searchParams.get("keyword") || "").trim().toLowerCase();
  const db = readDb();
  const logs = listOperationLogs({ action: url.searchParams.get("action") || "" })
    .map((log) => toReadableOperationLog(log, db))
    .filter((log) => !keyword || `${log.summary} ${log.userName} ${log.createdAt}`.toLowerCase().includes(keyword));
  sendJson(res, 200, { logs });
}

function toReadableOperationLog(log, db) {
  const actor = displayName(log.userName, "系统");
  const detail = parseDetail(log.detail);
  const task = findTaskForLog(log, detail, db);
  const targetUser = log.targetType === "user" ? findUserName(db, log.targetId) : "";
  const taskTitle = task ? quoted(task.title || "未命名任务") : "一个任务";
  const summary = operationSummary({ log, actor, detail, task, taskTitle, targetUser });
  return {
    id: log.id,
    userName: actor,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    createdAt: log.createdAt,
    summary,
  };
}

function operationSummary({ log, actor, detail, task, taskTitle, targetUser }) {
  switch (log.action) {
    case "auth.login.success":
      return `${actor} 登录了系统`;
    case "auth.logout":
      return `${actor} 退出了系统`;
    case "auth.login.failed":
      return `${displayName(log.targetTitle || actor, "某账号")} 登录失败`;
    case "create_task": {
      const assigneeName = task ? findUserNameFromTaskAssignee(task) : "设计师";
      if (task?.visibility === "private") return `${actor} 创建了个人任务${taskTitle}`;
      return `${actor} 为 ${displayName(assigneeName, "设计师")} 发布了任务${taskTitle}`;
    }
    case "update_task":
      return `${actor} 修改了任务${taskTitle}`;
    case "update_task_status": {
      const from = statusText[detail?.before?.status] || detail?.before?.status || "原状态";
      const to = statusText[detail?.after?.status] || detail?.after?.status || task?.status || "新状态";
      return `${actor} 将任务${taskTitle}从${from}更新为${to}`;
    }
    case "task.delete":
      return `${actor} 删除了任务${taskTitle}`;
    case "archive_task":
      return `${actor} 归档了任务${taskTitle}`;
    case "restore_task":
      return `${actor} 恢复了归档任务${taskTitle}`;
    case "upload_file":
      return `${actor} 在任务${taskTitle}上传了${uploadDetailText(log.detail)}`;
    case "file.delete":
      return `${actor} 删除了任务${taskTitle}中的文件${quoted(detail.originalName || "")}`.replace(/文件$/, "文件");
    case "create_comment":
      return `${actor} 在任务${taskTitle}发布了留言`;
    case "delete_comment":
      return `${actor} 删除了任务${taskTitle}中的一条留言`;
    case "create_personal_note":
      return `${actor} 在任务${taskTitle}添加了个人备注`;
    case "delete_personal_note":
      return `${actor} 删除了任务${taskTitle}中的个人备注`;
    case "user.create":
      return `${actor} 创建了账号${quoted(targetUser || log.targetId || "")}`.replace(/账号$/, "账号");
    case "user.update":
      return `${actor} 修改了账号${quoted(targetUser || "")}`.replace(/账号$/, "账号");
    case "user.disable":
      return `${actor} 禁用了账号${quoted(targetUser || "")}`.replace(/账号$/, "账号");
    case "user.enable":
      return `${actor} 启用了账号${quoted(targetUser || "")}`.replace(/账号$/, "账号");
    case "user.delete_hard":
      return `${actor} 删除了一个账号`;
    case "user.update_password":
      return `${actor} 修改了账号密码`;
    case "department.create":
      return `${actor} 创建了部门`;
    case "department.update":
      return `${actor} 修改了部门`;
    case "department.disable":
      return `${actor} 禁用了部门`;
    case "maintenance.clean_missing_files":
      return `${actor} 清理了失效文件记录`;
    case "maintenance.compact_databases":
      return `${actor} 整理了数据库`;
    case "operation_logs.archive.manual":
      return `${actor} 手动归档了操作日志`;
    case "operation_logs.archive_to_folder":
      return `${actor} 将操作日志导出到了日期文件夹`;
    case "operation_logs.retention_prune":
      return `${actor} 将超过 30 天的旧日志从近期数据库移出`;
    default:
      return `${actor} 执行了${readableActionName(log.action)}`;
  }
}

function findTaskForLog(log, detail, db) {
  const taskId = log.targetType === "task" ? log.targetId : detail.taskId;
  return db.tasks.find((task) => task.id === taskId) || null;
}

function findUserNameFromTaskAssignee(task) {
  try {
    return readDb().users.find((user) => user.id === task.assigneeId)?.name || "";
  } catch {
    return "";
  }
}

function findUserName(db, userId) {
  return db.users.find((user) => user.id === userId)?.name || "";
}

function uploadDetailText(detailText) {
  const [usage, ...nameParts] = String(detailText || "").split(":");
  const fileName = nameParts.join(":").trim();
  const usageLabel = fileUsageText[String(usage || "").trim()] || "附件";
  return fileName ? `${usageLabel}${quoted(fileName)}` : usageLabel;
}

function readableActionName(action) {
  return String(action || "操作").replace(/[._-]+/g, " ").trim() || "操作";
}

function displayName(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function quoted(value) {
  const text = String(value || "").trim();
  return text ? `《${text}》` : "";
}

function parseDetail(value) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
  handleCompactDatabases,
  handleMaintenanceSummary,
  handleOperationLogs,
  handleScanMissingFiles,
  handleScanOrphanFiles,
};
