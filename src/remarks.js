const fs = require("fs");
const path = require("path");
const { REMARK_IMAGE_DIR } = require("./config");
const { readBody, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { enqueueUpload } = require("./upload-queue");
const {
  parseMultipartParts,
  sanitizeFilename,
  taskUploadFolderName,
} = require("./files");
const {
  createId,
  enrichTask,
  readDb,
  writeDb,
} = require("./storage");
const { requireUser } = require("./auth");
const { canWritePersonalNote } = require("./permissions");

async function handleCreateRemark(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canWritePersonalNote(user, task)) {
    sendError(res, 403, "只有设计师本人的个人任务可以新增备注记录");
    return;
  }

  const boundary = (req.headers["content-type"] || "").match(/boundary=(.+)$/)?.[1];
  if (!boundary) {
    sendError(res, 400, "备注格式不正确");
    return;
  }

  return enqueueUpload(async () => {
    const nextDb = readDb();
    const nextTask = nextDb.tasks.find((item) => item.id === taskId);
    if (!nextTask) {
      sendError(res, 404, "任务不存在");
      return;
    }
    if (!canWritePersonalNote(user, nextTask)) {
      sendError(res, 403, "无权修改该任务");
      return;
    }

    const { fields, files } = parseMultipartParts(await readBody(req), boundary);
    const text = String(fields.text || "").trim();
    const images = files.filter(isRemarkImage);
    if (!text && !images.length) {
      sendError(res, 400, "请填写备注或添加图片");
      return;
    }

    const now = new Date().toISOString();
    const imageRecords = images.map((file, index) => saveRemarkImage(nextDb, nextTask, user, file, index, now));
    nextDb.files.push(...imageRecords);
    if (!Array.isArray(nextTask.remarkRecords)) nextTask.remarkRecords = [];
    nextTask.remarkRecords.push({
      id: createId("remark"),
      taskId,
      authorId: user.id,
      text,
      imageFileIds: imageRecords.map((file) => file.id),
      createdAt: now,
    });
    if (text) nextTask.remark = text;
    nextTask.updatedAt = now;
    writeDb(nextDb);
    broadcast("tasks-changed", { taskId: nextTask.id });
    sendJson(res, 201, { task: enrichTask(nextDb, nextTask) });
  });
}

function saveRemarkImage(db, task, user, file, index, now) {
  const originalName = sanitizeFilename(file.filename || `remark-image-${index + 1}.png`);
  const id = createId("file");
  const storedName = `${id}${remarkImageExtension(file, originalName)}`;
  const folderName = taskUploadFolderName(db, task, "备注图片");
  const taskUploadDir = path.join(REMARK_IMAGE_DIR, folderName);
  if (!fs.existsSync(taskUploadDir)) fs.mkdirSync(taskUploadDir, { recursive: true });
  const relativePath = path.join(folderName, storedName);
  fs.writeFileSync(path.join(REMARK_IMAGE_DIR, relativePath), file.data);
  return {
    id,
    taskId: task.id,
    originalName,
    storedName,
    relativePath,
    folderName,
    size: file.data.length,
    mimeType: remarkImageMimeType(file, originalName),
    storageArea: "remarkImage",
    usage: "remark",
    uploadedBy: user.id,
    uploadedByName: user.name,
    uploadedByRole: user.role,
    uploadedAt: now,
  };
}

function isRemarkImage(file) {
  if (!file || file.name !== "images" || !file.data.length) return false;
  const type = String(file.contentType || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const ext = path.extname(file.filename || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext) || !ext || type === "application/octet-stream";
}

function remarkImageMimeType(file, originalName) {
  const type = String(file.contentType || "").toLowerCase();
  if (type.startsWith("image/")) return type;
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  }[path.extname(originalName).toLowerCase()] || "image/png";
}

function remarkImageExtension(file, originalName) {
  const ext = path.extname(originalName);
  if (ext) return ext;
  return {
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
  }[String(file.contentType || "").toLowerCase()] || ".png";
}

module.exports = {
  handleCreateRemark,
};
