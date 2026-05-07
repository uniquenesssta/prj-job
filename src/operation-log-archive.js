const fs = require("fs");
const path = require("path");
const { OPERATION_LOG_ARCHIVE_HOUR, OPERATION_LOG_ARCHIVE_MINUTE, OPERATION_LOG_DIR } = require("./config");
const { getOperationDatabase } = require("./database");
const { insertLogArchiveRecord, insertMaintenanceRecord } = require("./repositories/system-repo");

let archiveTimer = null;

function scheduleDailyOperationLogArchive() {
  if (archiveTimer) clearTimeout(archiveTimer);
  archiveTimer = setTimeout(async () => {
    try {
      exportOperationLogTxtForDate(previousLocalDateString());
    } finally {
      scheduleDailyOperationLogArchive();
    }
  }, millisecondsUntilNextMidnight());
}

function exportOperationLogTxtForDate(dateString) {
  const db = getOperationDatabase();
  const existing = db.prepare("SELECT id FROM log_archive_records WHERE archiveDate = ?").get(dateString);
  if (existing) return null;

  if (!fs.existsSync(OPERATION_LOG_DIR)) fs.mkdirSync(OPERATION_LOG_DIR, { recursive: true });
  const operationRows = db.prepare("SELECT * FROM operation_logs ORDER BY createdAt, rowid").all().filter((row) => localDateString(row.createdAt) === dateString);
  const maintenanceRows = db.prepare("SELECT * FROM maintenance_records ORDER BY createdAt, rowid").all().filter((row) => localDateString(row.createdAt) === dateString);
  const archivePath = path.join(OPERATION_LOG_DIR, `${dateString}-operation-log.txt`);
  const lines = [
    `日期：${dateString}`,
    `操作记录：${operationRows.length}`,
    `维护记录：${maintenanceRows.length}`,
    "",
    "【操作记录】",
    ...operationRows.map(formatOperationLogLine),
    "",
    "【维护记录】",
    ...maintenanceRows.map(formatMaintenanceLine),
    "",
  ];
  fs.writeFileSync(archivePath, lines.join("\r\n"), "utf8");

  insertLogArchiveRecord({
    archiveDate: dateString,
    archivePath,
    recordCount: operationRows.length + maintenanceRows.length,
  });
  insertMaintenanceRecord({
    action: "operation_txt_archive",
    status: "ok",
    detail: `已导出 ${dateString} 操作维护日志：${archivePath}`,
  });
  return archivePath;
}

function formatOperationLogLine(row) {
  return `[${formatLocalDateTime(row.createdAt)}] ${row.userName || "系统"} ${row.action || ""} ${row.targetType || ""}/${row.targetId || ""} ${row.detail || ""}`.trim();
}

function formatMaintenanceLine(row) {
  return `[${formatLocalDateTime(row.createdAt)}] ${row.status || "ok"} ${row.action || ""} ${row.detail || ""}`.trim();
}

function millisecondsUntilNextMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(OPERATION_LOG_ARCHIVE_HOUR, OPERATION_LOG_ARCHIVE_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

function previousLocalDateString(now = new Date()) {
  const previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  return localDateString(previous);
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
