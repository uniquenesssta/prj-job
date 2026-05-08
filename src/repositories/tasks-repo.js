const { getDatabase, runInTransaction } = require("../database");

const TASK_COLUMNS = [
  "id",
  "title",
  "description",
  "wechat",
  "orderNo",
  "taobaoId",
  "taskType",
  "sizeSpec",
  "deliverFormat",
  "customerRequirement",
  "remark",
  "remarkRecords",
  "visibility",
  "creatorId",
  "assigneeId",
  "priority",
  "status",
  "progress",
  "dueDate",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "archiveZipPath",
  "deletedAt",
  "deletedBy",
];

function listTasks(db = getDatabase()) {
  const attachmentRows = db.prepare("SELECT taskId, fileId FROM task_attachments ORDER BY taskId, position").all();
  const attachmentsByTask = groupValues(attachmentRows, "taskId", "fileId");
  return db.prepare("SELECT * FROM tasks ORDER BY createdAt, rowid").all().map((task) => ({
    ...task,
    progress: Number(task.progress || 0),
    attachments: attachmentsByTask.get(task.id) || [],
    remarkRecords: parseJsonArray(task.remarkRecords),
  }));
}

function insertTasks(tasks, db = getDatabase()) {
  (tasks || []).forEach((task) => insertTask(task, db));
}

function insertTask(task, db = getDatabase()) {
  const insertTaskStatement = db.prepare(`
    INSERT INTO tasks (
      id, title, description, wechat, orderNo, taobaoId, taskType, sizeSpec, deliverFormat, customerRequirement,
      remark, remarkRecords, visibility,
      creatorId, assigneeId, priority, status, progress, dueDate, createdAt, updatedAt, archivedAt, archiveZipPath,
      deletedAt, deletedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTaskStatement.run(...taskValues(task));
  replaceTaskAttachments(task.id, task.attachments || [], db);
}

function updateTask(task, db = getDatabase()) {
  const updateTaskStatement = db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, wechat = ?, orderNo = ?, taobaoId = ?, taskType = ?, sizeSpec = ?,
      deliverFormat = ?, customerRequirement = ?, remark = ?, remarkRecords = ?, visibility = ?, creatorId = ?,
      assigneeId = ?, priority = ?, status = ?, progress = ?, dueDate = ?, createdAt = ?, updatedAt = ?,
      archivedAt = ?, archiveZipPath = ?, deletedAt = ?, deletedBy = ?
    WHERE id = ?
  `);
  const values = taskValues(task);
  updateTaskStatement.run(...values.slice(1), task.id);
  if (Array.isArray(task.attachments)) replaceTaskAttachments(task.id, task.attachments, db);
}

function updateTaskOnly(task, db = getDatabase()) {
  updateTask(task, db);
}

function updateTaskUpdatedAt(taskId, updatedAt = new Date().toISOString(), db = getDatabase()) {
  db.prepare("UPDATE tasks SET updatedAt = ? WHERE id = ?").run(updatedAt, taskId);
}

function attachFileToTask(taskId, fileId, db = getDatabase()) {
  const row = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM task_attachments WHERE taskId = ?").get(taskId);
  db.prepare("INSERT OR IGNORE INTO task_attachments (taskId, fileId, position) VALUES (?, ?, ?)").run(taskId, fileId, Number(row?.position || 0));
}

function detachFileFromAllTasks(fileId, db = getDatabase()) {
  db.prepare("DELETE FROM task_attachments WHERE fileId = ?").run(fileId);
}

function replaceTaskAttachments(taskId, attachments, db = getDatabase()) {
  db.prepare("DELETE FROM task_attachments WHERE taskId = ?").run(taskId);
  const insertAttachment = db.prepare("INSERT INTO task_attachments (taskId, fileId, position) VALUES (?, ?, ?)");
  (attachments || []).forEach((fileId, index) => insertAttachment.run(taskId, fileId, index));
}

function saveTaskWithAttachments(task) {
  runInTransaction((db) => updateTask(task, db));
}

function taskValues(task) {
  return [
    task.id,
    String(task.title || ""),
    String(task.description || ""),
    String(task.wechat || ""),
    String(task.orderNo || ""),
    String(task.taobaoId || ""),
    String(task.taskType || ""),
    String(task.sizeSpec || ""),
    String(task.deliverFormat || ""),
    String(task.customerRequirement || ""),
    String(task.remark || ""),
    JSON.stringify(Array.isArray(task.remarkRecords) ? task.remarkRecords : []),
    String(task.visibility || "public"),
    String(task.creatorId || ""),
    String(task.assigneeId || ""),
    String(task.priority || "normal"),
    String(task.status || "todo"),
    Number(task.progress || 0),
    String(task.dueDate || ""),
    String(task.createdAt || new Date().toISOString()),
    String(task.updatedAt || new Date().toISOString()),
    String(task.archivedAt || ""),
    String(task.archiveZipPath || ""),
    String(task.deletedAt || ""),
    String(task.deletedBy || ""),
  ];
}

function groupValues(rows, keyField, valueField) {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row[keyField])) map.set(row[keyField], []);
    map.get(row[keyField]).push(row[valueField]);
  });
  return map;
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
  TASK_COLUMNS,
  attachFileToTask,
  detachFileFromAllTasks,
  insertTask,
  insertTasks,
  listTasks,
  replaceTaskAttachments,
  saveTaskWithAttachments,
  updateTask,
  updateTaskOnly,
  updateTaskUpdatedAt,
};
