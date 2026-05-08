const fs = require("fs");
const path = require("path");
const { REMARK_IMAGE_DIR } = require("./config");
const { readBody, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { enqueueUpload } = require("./upload-queue");
const {
  parseMultipartBoundary,
  parseMultipartParts,
  sanitizeFilename,
  taskUploadFolderName,
} = require("./files");
const { createId, enrichTask, readDb } = require("./storage");
const { insertPersonalNote } = require("./repositories/notes-repo");
const { insertFile } = require("./repositories/files-repo");
const { updateTask } = require("./repositories/tasks-repo");
const { requireUser } = require("./auth");
const { canWritePersonalRemark } = require("./permissions");
const { runInTransaction } = require("./database");

const DEFAULT_MAX_REMARK_IMAGE_UPLOAD_SIZE = 50 * 1024 * 1024;
const MAX_REMARK_IMAGE_UPLOAD_SIZE = Number.isFinite(Number(process.env.MAX_REMARK_IMAGE_UPLOAD_SIZE))
  ? Number(process.env.MAX_REMARK_IMAGE_UPLOAD_SIZE)
  : DEFAULT_MAX_REMARK_IMAGE_UPLOAD_SIZE;
const MAX_REMARK_IMAGE_COUNT = 9;
const ALLOWED_REMARK_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

async function handleCreateRemark(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (task.archivedAt) {
    sendError(res, 400, "归档任务不能新增备注，请先恢复显示");
    return;
  }
  if (!canWritePersonalRemark(user, task)) {
    sendError(res, 403, "只有设计师本人的个人任务可以新增备注记录");
    return;
  }

  const boundary = parseMultipartBoundary(req.headers["content-type"] || "");
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
    if (nextTask.archivedAt) {
      sendError(res, 400, "归档任务不能新增备注，请先恢复显示");
      return;
    }
    if (!canWritePersonalRemark(user, nextTask)) {
      sendError(res, 403, "无权修改该任务");
      return;
    }

    let body;
    try {
      body = await readBody(req, MAX_REMARK_IMAGE_UPLOAD_SIZE);
    } catch (error) {
      if (error.message === "请求内容过大") {
        sendError(res, 413, `备注图片过大，单次上传不能超过 ${formatLimitSize(MAX_REMARK_IMAGE_UPLOAD_SIZE)}`);
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
      sendError(res, 400, "请填写备注或添加图片");
      return;
    }

    const now = new Date().toISOString();
    const imageRecords = images.map((file, index) => saveRemarkImage(nextDb, nextTask, user, file, index, now));
    const noteId = createId("note");
    const imageFileIds = imageRecords.map((file) => file.id);
    if (!Array.isArray(nextTask.remarkRecords)) nextTask.remarkRecords = [];
    nextTask.remarkRecords.push({
      id: noteId,
      taskId,
      authorId: user.id,
      text,
      imageFileIds,
      createdAt: now,
    });
    if (text) nextTask.remark = text;
    nextTask.updatedAt = now;
    runInTransaction((database) => {
      imageRecords.forEach((record) => insertFile(record, database));
      updateTask(nextTask, database);
    });
    nextDb.files.push(...imageRecords);
    insertPersonalNote({ id: noteId, taskId, userId: user.id, text, imageFileIds, createdAt: now });
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

function validateRemarkImages(files) {
  const nonEmpty = (files || []).filter((file) => file && file.data?.length);
  if (nonEmpty.length > MAX_REMARK_IMAGE_COUNT) {
    return { ok: false, error: `每次最多上传 ${MAX_REMARK_IMAGE_COUNT} 张图片` };
  }
  const invalid = nonEmpty.find((file) => !isRemarkImage(file));
  if (invalid) {
    return { ok: false, error: `备注图片只允许上传 PNG/JPG/JPEG/GIF/WEBP/BMP/SVG 图片：${sanitizeFilename(invalid.filename || "未命名文件")}` };
  }
  return { ok: true, images: nonEmpty };
}

function isRemarkImage(file) {
  if (!file || !file.data?.length) return false;
  const ext = path.extname(file.filename || "").toLowerCase();
  if (!ALLOWED_REMARK_IMAGE_EXTENSIONS.has(ext)) return false;
  const type = String(file.contentType || "").toLowerCase();
  if (type && type !== "application/octet-stream" && !type.startsWith("image/")) return false;
  return hasImageSignature(file.data, ext);
}

function hasImageSignature(buffer, ext) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
  if (ext === ".png") return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (ext === ".jpg" || ext === ".jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (ext === ".gif") return buffer.slice(0, 6).toString("ascii") === "GIF87a" || buffer.slice(0, 6).toString("ascii") === "GIF89a";
  if (ext === ".webp") return buffer.length > 12 && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (ext === ".bmp") return buffer.length > 2 && buffer.slice(0, 2).toString("ascii") === "BM";
  if (ext === ".svg") return buffer.slice(0, 512).toString("utf8").toLowerCase().includes("<svg");
  return false;
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
  const ext = path.extname(originalName).toLowerCase();
  if (ALLOWED_REMARK_IMAGE_EXTENSIONS.has(ext)) return ext;
  return {
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
  }[String(file.contentType || "").toLowerCase()] || ".png";
}

function formatLimitSize(size) {
  if (size < 1024 * 1024) return `${Math.floor(size / 1024)} KB`;
  return `${Math.floor(size / 1024 / 1024)} MB`;
}

module.exports = {
  ALLOWED_REMARK_IMAGE_EXTENSIONS,
  MAX_REMARK_IMAGE_COUNT,
  MAX_REMARK_IMAGE_UPLOAD_SIZE,
  handleCreateRemark,
  isRemarkImage,
  saveRemarkImage,
  validateRemarkImages,
};
