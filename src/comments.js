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
    .map((comment) => {
      const author = db.users.find((item) => item.id === comment.authorId);
      return {
        ...comment,
        authorName: author ? author.name : "未知",
        authorRole: author ? author.role : "unknown",
      };
    });
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
  broadcast("tasks-changed", { taskId });
  sendJson(res, 201, { comment, task: enrichTask(db, task, comments) });
}

module.exports = {
  handleCreateComment,
  handleGetComments,
};
