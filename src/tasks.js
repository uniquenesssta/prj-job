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
  canCreatePersonalTask,
  canCreatePublicTask,
  canEditTaskBrief,
  canRestoreTask,
  canUpdateTaskStatus,
} = require("./permissions");
const { insertOperationLog, markArchiveRecordRestored } = require("./repositories/system-repo");

function handleGetTasks(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const comments = readComments();
  const includeArchived = user.role === "owner" && new URL(req.url, `http://${req.headers.host}`).searchParams.get("archived") === "1";
  const tasks = db.tasks
    .filter((task) => canAccessTask(user, task))
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
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权修改该任务");
    return;
  }
  const briefFields = [
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
  if (!canEditTaskBrief(user, task) && briefFields.some((field) => Object.hasOwn(body, field))) {
    sendError(res, 403, "当前账号只能更新进度和状态");
    return;
  }
  if (Object.hasOwn(body, "status") && !canUpdateTaskStatus(user, task)) {
    sendError(res, 403, "当前账号无权更新任务状态");
    return;
  }
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
  if (body.assigneeId !== undefined && db.users.some((item) => item.id === body.assigneeId && item.role === "designer")) task.assigneeId = body.assigneeId;
  if (body.dueDate !== undefined) task.dueDate = String(body.dueDate).trim();
  if (["low", "normal", "high", "urgent"].includes(body.priority)) task.priority = body.priority;
  if (["todo", "doing", "review", "done", "blocked"].includes(body.status)) {
    task.status = body.status;
    task.progress = progressForStatus(body.status);
  }
  task.updatedAt = new Date().toISOString();
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: Object.hasOwn(body, "status") ? "update_task_status" : "update_task",
    targetType: "task",
    targetId: task.id,
    detail: JSON.stringify(Object.keys(body)),
    createdAt: task.updatedAt,
  });
  broadcast("tasks-changed", { taskId: task.id });
  sendJson(res, 200, { task: enrichTask(db, task) });
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
  handleGetTasks,
  handleRestoreTask,
  handleUpdateTask,
};
