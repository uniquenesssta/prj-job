const { getDatabase } = require("../database");

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
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, title, description, wechat, orderNo, taobaoId, taskType, sizeSpec, deliverFormat, customerRequirement,
      remark, remarkRecords, visibility,
      creatorId, assigneeId, priority, status, progress, dueDate, createdAt, updatedAt, archivedAt, archiveZipPath,
      deletedAt, deletedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAttachment = db.prepare("INSERT INTO task_attachments (taskId, fileId, position) VALUES (?, ?, ?)");

  (tasks || []).forEach((task) => {
    insertTask.run(
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
      String(task.deletedBy || "")
    );
    (task.attachments || []).forEach((fileId, index) => insertAttachment.run(task.id, fileId, index));
  });
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
  insertTasks,
  listTasks,
};
