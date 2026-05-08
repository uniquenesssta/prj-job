const { URL } = require("url");
const { readJson, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const {
  createId,
  enrichTask,
  readComments,
  readDb,
  writeDb,
} = require("./storage");
const { requireUser } = require("./auth");
const {
  canAccessTask,
  canChangeTaskStatus,
  canCreatePersonalTask,
  canCreatePublicTask,
  canDeleteTask,
  canEditTaskField,
  canRestoreTask,
  canUpdateTaskStatus,
  canViewOtherDesigners,
  canViewOtherServices,
  hasPermission,
} = require("./permissions");
const { insertOperationLog, markArchiveRecordRestored } = require("./repositories/system-repo");

const TASK_EDIT_FIELDS = [
  "title",
  "description",
  "assigneeId",
  "dueDate",
  "priority",
  "wechat",
  "orderNo",
  "taobaoId",
  "taskType",
  "sizeSpec",
  "deliverFormat",
  "customerRequirement",
  "remark",
];

function handleGetTasks(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const comments = readComments();
  const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const includeArchived = hasPermission(user, "archives.manage") && params.get("archived") === "1";
  const designerId = params.get("designerId") || "";
  const serviceId = params.get("serviceId") || "";
  const scope = params.get("scope") || "";

  if ((scope === "other-designers" || designerId) && !canViewOtherDesigners(user) && !hasPermission(user, "tasks.read_all")) {
    sendError(res, 403, "当前账号不能查看其他设计师");
    return;
  }
  if ((scope === "other-services" || serviceId) && !canViewOtherServices(user) && !hasPermission(user, "tasks.read_all")) {
    sendError(res, 403, "当前账号不能查看其他客服");
    return;
  }

  const tasks = db.tasks
    .filter((task) => canAccessTask(user, task))
    .filter((task) => !task.deletedAt)
    .filter((task) => !designerId || task.assigneeId === designerId)
    .filter((task) => !serviceId || task.creatorId === serviceId)
    .filter((task) => (scope !== "other-designers" || (task.assigneeId && task.visibility !== "private")))
    .filter((task) => (scope !== "other-services" || (task.creatorId && task.visibility !== "private")))
    .filter((task) => {
      if (!task.archivedAt) return true;
      return includeArchived;
    })
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))
    .map((task) => enrichTask(db, task, comments));
  sendJson(res, 200, { tasks });
}

async function handleCreateTask(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const isPrivateDesignerTask = user.role === "designer";
  if (isPrivateDesignerTask ? !canCreatePersonalTask(user) : !canCreatePublicTask(user)) {
    sendError(res, 403, "当前账号不能新建任务");
    return;
  }
  const body = await readJson(req);
  const db = readDb();
  const comments = readComments();
  const assigneeId = isPrivateDesignerTask ? user.id : body.assigneeId;
  const assignee = db.users.find((item) => item.id === assigneeId && item.role === "designer");
  if (!body.title || !assignee) {
    sendError(res, 400, "请填写任务标题并选择设计师");
    return;
  }
  const now = new Date().toISOString();
  const task = {
    id: createId("task"),
    title: String(body.title).trim(),
    description: String(body.description || "").trim(),
    wechat: String(body.wechat || "").trim(),
    orderNo: String(body.orderNo || "").trim(),
    taobaoId: String(body.taobaoId || "").trim(),
    taskType: String(body.taskType || "").trim(),
    sizeSpec: String(body.sizeSpec || "").trim(),
    deliverFormat: String(body.deliverFormat || "").trim(),
    customerRequirement: String(body.customerRequirement || "").trim(),
    remark: String(body.remark || "").trim(),
    remarkRecords: [],
    visibility: isPrivateDesignerTask ? "private" : "public",
    creatorId: user.id,
    assigneeId: assignee.id,
    priority: ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal",
    status: "todo",
    progress: 0,
    dueDate: String(body.dueDate || "").trim(),
    createdAt: now,
    updatedAt: now,
    attachments: [],
    deletedAt: "",
    deletedBy: "",
  };
  db.tasks.push(task);
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "create_task",
    targetType: "task",
    targetId: task.id,
    detail: task.visibility === "private" ? "新建个人任务" : "新建公共任务",
    createdAt: now,
  });
  broadcast("tasks-changed", { taskId: task.id });
  sendJson(res, 201, { task: enrichTask(db, task, comments) });
}

async function handleUpdateTask(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId && !item.deletedAt);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权修改该任务");
    return;
  }

  const submittedEditFields = TASK_EDIT_FIELDS.filter((field) => Object.hasOwn(body, field));
  const forbiddenField = submittedEditFields.find((field) => !canEditTaskField(user, task, field));
  if (forbiddenField) {
    sendError(res, 403, `当前账号无权修改字段：${forbiddenField}`);
    return;
  }

  if (Object.hasOwn(body, "status")) {
    const nextStatus = String(body.status || "");
    if (!canUpdateTaskStatus(user, task) || !canChangeTaskStatus(user, task, nextStatus)) {
      sendError(res, 403, "当前账号无权执行该状态流转");
      return;
    }
  }

  const before = pickTaskSnapshot(task, [...submittedEditFields, Object.hasOwn(body, "status") ? "status" : ""].filter(Boolean));

  if (body.title !== undefined) task.title = String(body.title).trim();
  if (body.description !== undefined) task.description = String(body.description).trim();
  if (body.wechat !== undefined) task.wechat = String(body.wechat).trim();
  if (body.orderNo !== undefined) task.orderNo = String(body.orderNo).trim();
  if (body.taobaoId !== undefined) task.taobaoId = String(body.taobaoId).trim();
  if (body.taskType !== undefined) task.taskType = String(body.taskType).trim();
  if (body.sizeSpec !== undefined) task.sizeSpec = String(body.sizeSpec).trim();
  if (body.deliverFormat !== undefined) task.deliverFormat = String(body.deliverFormat).trim();
  if (body.customerRequirement !== undefined) task.customerRequirement = String(body.customerRequirement).trim();
  if (body.remark !== undefined) task.remark = String(body.remark).trim();
  if (body.assigneeId !== undefined && db.users.some((item) => item.id === body.assigneeId && item.role === "designer")) {
    if (task.visibility === "private" && !hasPermission(user, "tasks.read_all") && body.assigneeId !== user.id) {
      sendError(res, 403, "个人任务不能改派给其他设计师");
      return;
    }
    task.assigneeId = body.assigneeId;
  }
  if (body.dueDate !== undefined) task.dueDate = String(body.dueDate).trim();
  if (["low", "normal", "high", "urgent"].includes(body.priority)) task.priority = body.priority;
  if (["todo", "doing", "review", "done", "blocked"].includes(body.status)) {
    task.status = body.status;
    task.progress = progressForStatus(body.status);
  }
  task.updatedAt = new Date().toISOString();
  const after = pickTaskSnapshot(task, Object.keys(before));
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: Object.hasOwn(body, "status") ? "update_task_status" : "update_task",
    targetType: "task",
    targetId: task.id,
    detail: JSON.stringify({ fields: Object.keys(before), before, after }),
    createdAt: task.updatedAt,
  });
  broadcast("tasks-changed", { taskId: task.id });
  sendJson(res, 200, { task: enrichTask(db, task) });
}

async function handleDeleteTask(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId && !item.deletedAt);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canDeleteTask(user, task)) {
    sendError(res, 403, "只有管理员可以删除任务");
    return;
  }
  const now = new Date().toISOString();
  task.deletedAt = now;
  task.deletedBy = user.id;
  task.updatedAt = now;
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "task.delete",
    targetType: "task",
    targetId: task.id,
    detail: JSON.stringify({ title: task.title, status: task.status, assigneeId: task.assigneeId }),
    createdAt: now,
  });
  broadcast("tasks-changed", { taskId: task.id });
  sendJson(res, 200, { ok: true });
}

async function handleRestoreTask(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canRestoreTask(user, task)) {
    sendError(res, 403, "只有管理员可以恢复归档任务");
    return;
  }
  task.archivedAt = "";
  task.archiveZipPath = "";
  const now = new Date().toISOString();
  task.updatedAt = now;
  writeDb(db);
  markArchiveRecordRestored(task.id, now);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "restore_task",
    targetType: "task",
    targetId: task.id,
    detail: "恢复归档任务",
    createdAt: now,
  });
  broadcast("tasks-changed", { taskId: task.id });
  sendJson(res, 200, { task: enrichTask(db, task) });
}

function pickTaskSnapshot(task, fields) {
  return [...new Set(fields)].reduce((result, field) => {
    result[field] = task[field];
    return result;
  }, {});
}

function progressForStatus(status) {
  return {
    todo: 0,
    doing: 45,
    review: 85,
    done: 100,
    blocked: 20,
  }[status] ?? 0;
}

module.exports = {
  handleCreateTask,
  handleDeleteTask,
  handleGetTasks,
  handleRestoreTask,
  handleUpdateTask,
};
