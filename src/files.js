const fs = require("fs");
const path = require("path");
const { REMARK_IMAGE_DIR, UPLOAD_DIR } = require("./config");
const { readBody, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { createId, enrichTask, readDb, writeDb } = require("./storage");
const { requireUser } = require("./auth");
const { canDownloadTaskFile, canUploadToTask } = require("./permissions");
const { enqueueUpload } = require("./upload-queue");
const { insertOperationLog } = require("./repositories/system-repo");

async function handleUpload(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canUploadToTask(user, task)) {
    sendError(res, 403, "无权上传到该任务");
    return;
  }
  const boundary = (req.headers["content-type"] || "").match(/boundary=(.+)$/)?.[1];
  if (!boundary) {
    sendError(res, 400, "上传格式不正确");
    return;
  }
  return enqueueUpload(async () => {
    const nextDb = readDb();
    const nextTask = nextDb.tasks.find((item) => item.id === taskId);
    if (!nextTask) {
      sendError(res, 404, "任务不存在");
      return;
    }
    if (!canUploadToTask(user, nextTask)) {
      sendError(res, 403, "无权上传到该任务");
      return;
    }
    const parsed = parseMultipartParts(await readBody(req), boundary);
    const file = parsed.files.find((item) => item.name === "file") || null;
    const usage = normalizeFileUsage(parsed.fields.usage || parsed.fields.fileCategory || defaultFileUsage(user));
    if (!file || !file.data.length) {
      sendError(res, 400, "请选择要上传的文件");
      return;
    }
    const originalName = sanitizeFilename(file.filename || "upload.bin");
    const id = createId("file");
    const storedName = `${id}${path.extname(originalName)}`;
    const folderName = taskUploadFolderName(nextDb, nextTask, "上传");
    const taskUploadDir = path.join(UPLOAD_DIR, folderName);
    if (!fs.existsSync(taskUploadDir)) fs.mkdirSync(taskUploadDir, { recursive: true });
    const relativePath = path.join(folderName, storedName);
    fs.writeFileSync(path.join(UPLOAD_DIR, relativePath), file.data);
    const record = {
      id,
      taskId,
      originalName,
      storedName,
      relativePath,
      folderName,
      size: file.data.length,
      mimeType: file.contentType || "application/octet-stream",
      usage,
      uploadedBy: user.id,
      uploadedByName: user.name,
      uploadedByRole: user.role,
      uploadedAt: new Date().toISOString(),
    };
    nextDb.files.push(record);
    nextTask.attachments.push(record.id);
    nextTask.updatedAt = new Date().toISOString();
    writeDb(nextDb);
    insertOperationLog({
      userId: user.id,
      userName: user.name,
      action: "upload_file",
      targetType: "task",
      targetId: nextTask.id,
      detail: `${usage}: ${originalName}`,
      createdAt: record.uploadedAt,
    });
    broadcast("files-changed", { taskId: nextTask.id, fileId: record.id });
    sendJson(res, 201, { file: record, task: enrichTask(nextDb, nextTask) });
  });
}

function parseMultipartFile(buffer, boundary) {
  return parseMultipartParts(buffer, boundary).files.find((file) => file.name === "file") || null;
}

function parseMultipartParts(buffer, boundary) {
  const fields = {};
  const files = [];
  let start = buffer.indexOf(Buffer.from(`--${boundary}`));
  while (start !== -1) {
    const headerStart = start + boundary.length + 4;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) return { fields, files };
    const header = buffer.slice(headerStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
    if (nextBoundary === -1) return { fields, files };
    const disposition = header.match(/Content-Disposition:[^\r\n]+/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1] || "";
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    const data = buffer.slice(dataStart, nextBoundary);
    if (filename !== undefined) {
      files.push({
        name,
        filename: filename || "upload.bin",
        contentType: header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream",
        data,
      });
    } else if (name) {
      fields[name] = data.toString("utf8");
    }
    start = buffer.indexOf(Buffer.from(`--${boundary}`), nextBoundary + 2);
  }
  return { fields, files };
}

function sanitizeFilename(filename) {
  return (path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 160) || "upload.bin");
}

function defaultFileUsage(user) {
  if (user.role === "service") return "material";
  if (user.role === "designer") return "draft";
  return "other";
}

function normalizeFileUsage(value) {
  const usage = String(value || "").trim();
  return ["material", "reference", "draft", "final", "source", "other", "remark"].includes(usage) ? usage : "other";
}

function sanitizeFolderPart(value, fallback = "未填写") {
  return String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "")
    .slice(0, 60) || fallback;
}

function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatArchiveStamp(date = new Date()) {
  const time = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  return `${formatDate(date)}-${time}`;
}

function taskUploadFolderName(db, task, suffix) {
  const assignee = db.users.find((item) => item.id === task.assigneeId);
  return `${formatDate()}-${sanitizeFolderPart(task.wechat, "无微信")}_${sanitizeFolderPart(task.orderNo, "无订单")}_${sanitizeFolderPart(assignee?.name || task.assigneeName, "未分配")}-${suffix}`;
}

function storedFilePath(file) {
  const baseDir = file.storageArea === "remarkImage" ? REMARK_IMAGE_DIR : UPLOAD_DIR;
  return path.join(baseDir, file.relativePath || file.storedName);
}

function handleDownload(req, res, fileId) {
  return streamFile(req, res, fileId, "attachment");
}

function handleInlineFile(req, res, fileId) {
  return streamFile(req, res, fileId, "inline");
}

function streamFile(req, res, fileId, dispositionType) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const file = db.files.find((item) => item.id === fileId);
  if (!file) {
    sendError(res, 404, "文件不存在");
    return;
  }
  const task = db.tasks.find((item) => item.id === file.taskId);
  if (!task || !canDownloadTaskFile(user, task, file)) {
    sendError(res, 403, "无权下载该文件");
    return;
  }
  const filePath = storedFilePath(file);
  if (!fs.existsSync(filePath)) {
    sendError(res, 404, "文件已丢失");
    return;
  }
  res.writeHead(200, {
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Length": fs.statSync(filePath).size,
    "Content-Disposition": `${dispositionType}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function uniquePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let index = 2;
  while (true) {
    const next = path.join(dir, `${base}-${index}${ext}`);
    if (!fs.existsSync(next)) return next;
    index += 1;
  }
}

module.exports = {
  formatArchiveStamp,
  formatDate,
  handleDownload,
  handleInlineFile,
  handleUpload,
  parseMultipartParts,
  sanitizeFilename,
  sanitizeFolderPart,
  storedFilePath,
  taskUploadFolderName,
  uniquePath,
};
