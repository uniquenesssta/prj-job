const { readJson, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const {
  createId,
  enrichTask,
  readComments,
  readDb,
  writeComments,
  writeDb,
} = require("./storage");
const { requireUser } = require("./auth");
const { canAccessTask, canCommentTask } = require("./permissions");
const { insertOperationLog } = require("./repositories/system-repo");

function handleGetComments(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权查看该任务留言");
    return;
  }
  const comments = readComments()
    .filter((comment) => comment.taskId === taskId)
    .map((comment) => enrichComment(db, comment));
  sendJson(res, 200, { comments });
}

async function handleCreateComment(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canCommentTask(user, task)) {
    sendError(res, 403, "无权留言该任务");
    return;
  }

  const body = await readJson(req);
  const text = String(body.text || "").trim();
  if (!text) {
    sendError(res, 400, "请填写留言内容");
    return;
  }

  const comments = readComments();
  const comment = {
    id: createId("comment"),
    taskId,
    authorId: user.id,
    text,
    createdAt: new Date().toISOString(),
  };
  comments.push(comment);
  task.updatedAt = comment.createdAt;
  writeComments(comments);
  writeDb(db);
  const enrichedComment = enrichComment(db, comment);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "create_comment",
    targetType: "task",
    targetId: taskId,
    detail: text.slice(0, 120),
    createdAt: comment.createdAt,
  });
  broadcast("comments-changed", { taskId, comment: enrichedComment, reason: "comment-created" });
  broadcast("tasks-changed", { taskId, reason: "comment-created" });
  sendJson(res, 201, { comment: enrichedComment, task: enrichTask(db, task, comments) });
}

function enrichComment(db, comment) {
  const author = db.users.find((item) => item.id === comment.authorId);
  return {
    ...comment,
    authorName: author ? author.name : "未知",
    authorRole: author ? author.role : "unknown",
  };
}

module.exports = {
  handleCreateComment,
  handleGetComments,
};
