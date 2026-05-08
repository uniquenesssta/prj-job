const fs = require("fs");
const { readBody, readJson, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { createId, readDb } = require("./storage");
const {
  deletePersonalNoteForUser,
  insertPersonalNote,
  listPersonalNotesForUserTask,
} = require("./repositories/notes-repo");
const { deleteFileRecord, insertFile } = require("./repositories/files-repo");
const { updateTask } = require("./repositories/tasks-repo");
const { enqueueUpload } = require("./upload-queue");
const { parseMultipartBoundary, parseMultipartParts, storedFilePath } = require("./files");
const { saveRemarkImage, validateRemarkImages, MAX_REMARK_IMAGE_UPLOAD_SIZE } = require("./remarks");
const { requireUser } = require("./auth");
const { canAccessTask, canReadPersonalNote, canWritePersonalNote } = require("./permissions");
const { runInTransaction } = require("./database");
const { insertOperationLog } = require("./repositories/system-repo");

function handleGetPersonalNote(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权查看该任务的个人备注");
    return;
  }
  const notes = listPersonalNotesForUserTask(user.id, taskId)
    .filter((note) => canReadPersonalNote(user, task, note))
    .map((note) => enrichPersonalNote(db, note));
  sendJson(res, 200, { notes });
}

async function handlePutPersonalNote(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (task.archivedAt) {
    sendError(res, 400, "归档任务不能新增个人备注，请先恢复显示");
    return;
  }
  if (!canWritePersonalNote(user, task)) {
    sendError(res, 403, "无权保存该任务的个人备注");
    return;
  }
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return handleMultipartPersonalNote(req, res, user, taskId);
  }

  const body = await readJson(req);
  const text = String(body.text || "").trim();
  if (!text) {
    sendError(res, 400, "请填写个人备注内容");
    return;
  }
  const now = new Date().toISOString();
  const note = {
    id: createId("note"),
    taskId,
    userId: user.id,
    text,
    imageFileIds: [],
    createdAt: now,
  };
  insertPersonalNote(note);
  task.updatedAt = now;
  updateTask(task);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "create_personal_note",
    targetType: "task",
    targetId: taskId,
    detail: text.slice(0, 120),
    createdAt: now,
  });
  broadcast("tasks-changed", { taskId });
  sendJson(res, 201, { note: enrichPersonalNote(db, note) });
}

async function handleMultipartPersonalNote(req, res, user, taskId) {
  const boundary = parseMultipartBoundary(req.headers["content-type"] || "");
  if (!boundary) {
    sendError(res, 400, "个人备注格式不正确");
    return;
  }

  return enqueueUpload(async () => {
    const db = readDb();
    const task = db.tasks.find((item) => item.id === taskId);
    if (!task) {
      sendError(res, 404, "任务不存在");
      return;
    }
    if (task.archivedAt) {
      sendError(res, 400, "归档任务不能新增个人备注，请先恢复显示");
      return;
    }
    if (!canWritePersonalNote(user, task)) {
      sendError(res, 403, "无权保存该任务的个人备注");
      return;
    }

    let body;
    try {
      body = await readBody(req, MAX_REMARK_IMAGE_UPLOAD_SIZE);
    } catch (error) {
      if (error.message === "请求内容过大") {
        sendError(res, 413, `个人备注图片过大，单次上传不能超过 ${Math.floor(MAX_REMARK_IMAGE_UPLOAD_SIZE / 1024 / 1024)} MB`);
        return;
      }
      throw error;
    }

    const { fields, files } = parseMultipartParts(body, boundary);
    const text = String(fields.text || "").trim();
    const imageValidation = validateRemarkImages(files.filter((file) => file.name === "images"));
    if (!imageValidation.ok) {
      sendError(res, 400, imageValidation.error);
      return;
    }
    const images = imageValidation.images;
    if (!text && !images.length) {
      sendError(res, 400, "请填写个人备注或添加图片");
      return;
    }

    const now = new Date().toISOString();
    const imageRecords = images.map((file, index) => saveRemarkImage(db, task, user, file, index, now));
    const note = {
      id: createId("note"),
      taskId,
      userId: user.id,
      text,
      imageFileIds: imageRecords.map((file) => file.id),
      createdAt: now,
    };
    task.updatedAt = now;
    runInTransaction((database) => {
      imageRecords.forEach((record) => insertFile(record, database));
      updateTask(task, database);
    });
    db.files.push(...imageRecords);
    insertPersonalNote(note);
    insertOperationLog({
      userId: user.id,
      userName: user.name,
      action: "create_personal_note",
      targetType: "task",
      targetId: taskId,
      detail: `文字 ${text.length} 字，图片 ${imageRecords.length} 张`,
      createdAt: now,
    });
    broadcast("tasks-changed", { taskId });
    sendJson(res, 201, { note: enrichPersonalNote(readDb(), note) });
  });
}

function handleDeletePersonalNote(req, res, taskId, noteId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (task.archivedAt) {
    sendError(res, 400, "归档任务不能删除个人备注，请先恢复显示");
    return;
  }
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权访问该任务");
    return;
  }
  const note = deletePersonalNoteForUser(noteId, user.id, taskId);
  if (!note) {
    sendError(res, 404, "备注不存在或不是你的备注");
    return;
  }
  const imageIds = new Set(note.imageFileIds || []);
  const imageFiles = db.files.filter((file) => imageIds.has(file.id));
  imageFiles.forEach(deletePhysicalFileQuietly);
  task.updatedAt = new Date().toISOString();
  runInTransaction((database) => {
    imageFiles.forEach((file) => deleteFileRecord(file.id, database));
    updateTask(task, database);
  });
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "delete_personal_note",
    targetType: "task",
    targetId: taskId,
    detail: note.text.slice(0, 120),
    createdAt: task.updatedAt,
  });
  broadcast("tasks-changed", { taskId, reason: "personal-note-deleted" });
  sendJson(res, 200, { ok: true, noteId });
}

function deletePhysicalFileQuietly(file) {
  try {
    const filePath = storedFilePath(file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn(`删除备注图片失败：${file?.id || "unknown"} ${error.message}`);
  }
}

function enrichPersonalNote(db, note) {
  const author = db.users.find((user) => user.id === note.userId);
  return {
    ...note,
    authorName: author ? author.name : "未知",
    authorRole: author ? author.role : "unknown",
    images: (note.imageFileIds || [])
      .map((fileId) => db.files.find((file) => file.id === fileId))
      .filter(Boolean),
  };
}

module.exports = {
  handleDeletePersonalNote,
  handleGetPersonalNote,
  handlePutPersonalNote,
};
