const fs = require("fs");
const path = require("path");
const { OPERATION_LOG_ARCHIVE_HOUR, OPERATION_LOG_ARCHIVE_MINUTE, OPERATION_LOG_DIR } = require("./config");
const { getOperationDatabase } = require("./database");
const { insertLogArchiveRecord, insertMaintenanceRecord, pruneArchivedOperationLogs } = require("./repositories/system-repo");

const LOG_RETENTION_DAYS = 30;
let archiveTimer = null;

function scheduleDailyOperationLogArchive() {
  if (archiveTimer) clearTimeout(archiveTimer);
  archiveTimer = setTimeout(async () => {
    try {
      exportOperationLogTxtForDate(previousLocalDateString());
    } finally {
      scheduleDailyOperationLogArchive();
    }
  }, millisecondsUntilNextArchiveTime());
}

function exportOperationLogTxtForDate(dateString, options = {}) {
  const normalizedDate = normalizeDateString(dateString);
  if (!normalizedDate) throw new Error("日志日期不正确");

  const db = getOperationDatabase();
  const existing = db.prepare("SELECT * FROM log_archive_records WHERE archiveDate = ?").get(normalizedDate);
  if (existing && isUsableArchivePath(existing.archivePath)) {
    const pruned = pruneOldArchivedLogs(options.retentionDays || LOG_RETENTION_DAYS);
    return {
      alreadyArchived: true,
      archiveDate: normalizedDate,
      archiveDir: existing.archivePath,
      files: archiveFilesForDir(existing.archivePath),
      operationCount: 0,
      maintenanceCount: 0,
      pruned,
    };
  }

  if (!fs.existsSync(OPERATION_LOG_DIR)) fs.mkdirSync(OPERATION_LOG_DIR, { recursive: true });
  const operationRows = db.prepare("SELECT * FROM operation_logs ORDER BY createdAt, rowid").all().filter((row) => localDateString(row.createdAt) === normalizedDate);
  const maintenanceRows = db.prepare("SELECT * FROM maintenance_records ORDER BY createdAt, rowid").all().filter((row) => localDateString(row.createdAt) === normalizedDate);
  const archiveDir = archiveDirectoryForDate(normalizedDate);
  fs.mkdirSync(archiveDir, { recursive: true });

  const files = writeStructuredArchiveFiles({
    archiveDir,
    dateString: normalizedDate,
    operationRows,
    maintenanceRows,
  });

  insertLogArchiveRecord({
    archiveDate: normalizedDate,
    archivePath: archiveDir,
    recordCount: operationRows.length + maintenanceRows.length,
  });
  insertMaintenanceRecord({
    action: "operation_logs.archive_to_folder",
    status: "ok",
    detail: JSON.stringify({
      archiveDate: normalizedDate,
      archiveDir,
      operationCount: operationRows.length,
      maintenanceCount: maintenanceRows.length,
      retentionDays: options.retentionDays || LOG_RETENTION_DAYS,
    }),
  });

  const pruned = pruneOldArchivedLogs(options.retentionDays || LOG_RETENTION_DAYS);
  return {
    alreadyArchived: false,
    archiveDate: normalizedDate,
    archiveDir,
    files,
    operationCount: operationRows.length,
    maintenanceCount: maintenanceRows.length,
    pruned,
  };
}

function writeStructuredArchiveFiles({ archiveDir, dateString, operationRows, maintenanceRows }) {
  const operationPath = path.join(archiveDir, "操作记录.txt");
  const maintenancePath = path.join(archiveDir, "维护记录.txt");
  const allPath = path.join(archiveDir, "全部日志.txt");
  const indexPath = path.join(archiveDir, "日志索引.json");

  const operationLines = [
    `日期：${dateString}`,
    `操作记录：${operationRows.length}`,
    "",
    ...operationRows.map(formatOperationLogLine),
    "",
  ];
  const maintenanceLines = [
    `日期：${dateString}`,
    `维护记录：${maintenanceRows.length}`,
    "",
    ...maintenanceRows.map(formatMaintenanceLine),
    "",
  ];
  const allRows = [
    ...operationRows.map((row) => ({ type: "操作", createdAt: row.createdAt, text: formatOperationLogLine(row) })),
    ...maintenanceRows.map((row) => ({ type: "维护", createdAt: row.createdAt, text: formatMaintenanceLine(row) })),
  ].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const allLines = [
    `日期：${dateString}`,
    `操作记录：${operationRows.length}`,
    `维护记录：${maintenanceRows.length}`,
    "",
    ...allRows.map((row) => row.text),
    "",
  ];

  fs.writeFileSync(operationPath, operationLines.join("\r\n"), "utf8");
  fs.writeFileSync(maintenancePath, maintenanceLines.join("\r\n"), "utf8");
  fs.writeFileSync(allPath, allLines.join("\r\n"), "utf8");
  fs.writeFileSync(indexPath, JSON.stringify({
    archiveDate: dateString,
    archiveDir,
    operationCount: operationRows.length,
    maintenanceCount: maintenanceRows.length,
    files: {
      operation: operationPath,
      maintenance: maintenancePath,
      all: allPath,
    },
    generatedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return {
    operation: operationPath,
    maintenance: maintenancePath,
    all: allPath,
    index: indexPath,
  };
}

function pruneOldArchivedLogs(retentionDays) {
  const pruned = pruneArchivedOperationLogs({
    cutoffDate: localDateString(addDays(new Date(), -Math.max(1, Number(retentionDays) || LOG_RETENTION_DAYS))),
  });
  if (pruned.operationLogs || pruned.maintenanceRecords) {
    insertMaintenanceRecord({
      action: "operation_logs.retention_prune",
      status: "ok",
      detail: JSON.stringify(pruned),
    });
  }
  return pruned;
}

function archiveDirectoryForDate(dateString) {
  const year = dateString.slice(0, 4);
  const month = dateString.slice(0, 7);
  return path.join(OPERATION_LOG_DIR, year, month, dateString);
}

function archiveFilesForDir(archiveDir) {
  return {
    operation: path.join(archiveDir, "操作记录.txt"),
    maintenance: path.join(archiveDir, "维护记录.txt"),
    all: path.join(archiveDir, "全部日志.txt"),
    index: path.join(archiveDir, "日志索引.json"),
  };
}

function isUsableArchivePath(archivePath) {
  try {
    return Boolean(archivePath && fs.existsSync(archivePath));
  } catch {
    return false;
  }
}

function formatOperationLogLine(row) {
  const time = formatLocalDateTime(row.createdAt);
  const actor = row.userName || "系统";
  const action = readableAction(row.action);
  const target = readableTarget(row.targetType, row.targetId);
  const detail = safeSingleLine(row.detail);
  return `[${time}] ${actor} ${action}${target}${detail ? `｜${detail}` : ""}`.trim();
}

function formatMaintenanceLine(row) {
  const time = formatLocalDateTime(row.createdAt);
  const status = row.status || "ok";
  const action = readableAction(row.action);
  const detail = safeSingleLine(row.detail);
  return `[${time}] ${status} ${action}${detail ? `｜${detail}` : ""}`.trim();
}

function readableAction(action) {
  const map = {
    "auth.login.success": "登录了系统",
    "auth.logout": "退出了系统",
    create_task: "创建任务",
    update_task: "修改任务",
    update_task_status: "更新任务状态",
    "task.delete": "删除任务",
    archive_task: "归档任务",
    restore_task: "恢复归档任务",
    upload_file: "上传文件",
    "file.delete": "删除文件",
    create_comment: "发布留言",
    delete_comment: "删除留言",
    create_personal_note: "添加个人备注",
    delete_personal_note: "删除个人备注",
    "user.create": "创建账号",
    "user.update": "修改账号",
    "user.disable": "禁用账号",
    "user.enable": "启用账号",
    "user.delete_hard": "删除账号",
    "department.create": "创建部门",
    "department.update": "修改部门",
    "maintenance.clean_missing_files": "清理失效文件记录",
    "maintenance.compact_databases": "整理数据库",
    "operation_logs.archive.manual": "手动归档日志",
    "operation_logs.archive_to_folder": "导出日志到文件夹",
    "operation_logs.retention_prune": "移出旧日志记录",
  };
  return map[action] || String(action || "记录了一次操作").replace(/[._-]+/g, " ");
}

function readableTarget(targetType, targetId) {
  if (!targetType && !targetId) return "";
  const typeText = {
    task: "任务",
    user: "账号",
    file: "文件",
    database: "数据库",
    operation_log: "操作日志",
    department: "部门",
  }[targetType] || targetType || "对象";
  return targetId ? `（${typeText}：${targetId}）` : `（${typeText}）`;
}

function safeSingleLine(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim();
}

function millisecondsUntilNextArchiveTime(now = new Date()) {
  const next = new Date(now);
  next.setHours(OPERATION_LOG_ARCHIVE_HOUR, OPERATION_LOG_ARCHIVE_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

function previousLocalDateString(now = new Date()) {
  return localDateString(addDays(now, -1));
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function normalizeDateString(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function localDateString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${localDateString(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

module.exports = {
  exportOperationLogTxtForDate,
  scheduleDailyOperationLogArchive,
};
