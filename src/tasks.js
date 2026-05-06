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
const { canAccessTask, canEditBrief, requireUser } = require("./auth");

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
  if (!["owner", "service", "designer"].includes(user.role)) {
    sendError(res, 403, "当前账号不能新建任务");
    return;
  }
  const body = await readJson(req);
  const db = readDb();
  const comments = readComments();
  const isPrivateDesignerTask = user.role === "designer";
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
    remark: String(body.remark || "").trim(),
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
  const briefFields = ["title", "description", "assigneeId", "dueDate", "priority", "wechat", "orderNo", "taobaoId"];
  if (!canEditBrief(user, task) && briefFields.some((field) => Object.hasOwn(body, field))) {
    sendError(res, 403, "当前账号只能更新进度和状态");
    return;
  }
  if (body.title !== undefined) task.title = String(body.title).trim();
  if (body.description !== undefined) task.description = String(body.description).trim();
  if (body.wechat !== undefined) task.wechat = String(body.wechat).trim();
  if (body.orderNo !== undefined) task.orderNo = String(body.orderNo).trim();
  if (body.taobaoId !== undefined) task.taobaoId = String(body.taobaoId).trim();
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
  broadcast("tasks-changed", { taskId: task.id });
  sendJson(res, 200, { task: enrichTask(db, task) });
}

async function handleRestoreTask(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以恢复归档任务");
    return;
  }
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  task.archivedAt = "";
  task.archiveZipPath = "";
  task.updatedAt = new Date().toISOString();
  writeDb(db);
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
