const fs = require("fs");
const path = require("path");
const { ARCHIVE_DIR, CONFIG } = require("./config");
const { sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { enrichTask, publicUser, readComments, readDb, writeDb, writeJsonFile } = require("./storage");
const { requireUser } = require("./auth");
const { canArchiveTask } = require("./permissions");
const {
  formatArchiveStamp,
  formatDate,
  sanitizeFilename,
  sanitizeFolderPart,
  storedFilePath,
  uniquePath,
} = require("./files");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function handleArchiveDoneTasks(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const tasks = db.tasks.filter((task) => canArchiveTask(user, task));
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以归档");
    return;
  }
  if (!tasks.length) {
    sendError(res, 400, "没有可归档的已完成任务");
    return;
  }
  try {
    const result = createTaskArchive(db, tasks);
    markTasksArchived(db, tasks, result.zipPath);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, `归档失败：${error.message}`);
  }
}

function handleArchiveOneTask(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以归档任务");
    return;
  }
  if (task.status !== "done") {
    sendError(res, 400, "只有已完成任务可以归档");
    return;
  }
  if (task.archivedAt) {
    sendError(res, 400, "该任务已经归档");
    return;
  }
  if (!canArchiveTask(user, task)) {
    sendError(res, 403, "无权归档该任务");
    return;
  }
  try {
    const result = createTaskArchive(db, [task]);
    markTasksArchived(db, [task], result.zipPath);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, `归档失败：${error.message}`);
  }
}

function markTasksArchived(db, tasks, zipPath) {
  const now = new Date().toISOString();
  for (const task of tasks) {
    task.archivedAt = now;
    task.archiveZipPath = zipPath;
    task.updatedAt = now;
  }
  writeDb(db);
  broadcast("tasks-changed", {});
}

function createTaskArchive(db, tasks) {
  const comments = readComments();
  const stamp = formatArchiveStamp();
  const archiveName = renderRule(CONFIG.archiveNameRule || "任务归档-{date}-{time}", {
    date: formatDate(),
    time: stamp.split("-").pop(),
    count: tasks.length,
  });
  const archivePath = uniqueDirectory(path.join(ARCHIVE_DIR, sanitizeFolderPart(archiveName, "任务归档")));
  const zipPath = `${archivePath}.zip`;

  fs.mkdirSync(archivePath, { recursive: true });
  fs.mkdirSync(path.join(archivePath, "tasks"), { recursive: true });
  writeJsonFile(path.join(archivePath, "任务列表.json"), tasks.map((task) => {
    const enriched = enrichTask(db, task, comments);
    return { ...enriched, comments: undefined };
  }));
  writeJsonFile(path.join(archivePath, "账号列表.json"), db.users.map(publicUser));

  for (const task of tasks) {
    const enriched = enrichTask(db, task, comments);
    const taskDir = path.join(archivePath, "tasks", archiveTaskFolderNameV2(db, task));
    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(path.join(taskDir, "files"), { recursive: true });
    fs.mkdirSync(path.join(taskDir, "remark-images"), { recursive: true });
    writeJsonFile(path.join(taskDir, "任务信息.json"), { ...enriched, comments: undefined });
    writeCommentTxt(path.join(taskDir, "留言.txt"), enriched.comments || []);
    writeRemarkTxt(path.join(taskDir, "个人备注.txt"), enriched.remarkRecords || []);

    for (const file of enriched.attachments || []) {
      const source = storedFilePath(file);
      if (!fs.existsSync(source)) continue;
      const target = path.join(taskDir, "files", `${sanitizeFolderPart(file.uploadedByName, "上传者")}-${sanitizeFilename(file.originalName)}`);
      fs.copyFileSync(source, uniquePath(target));
    }
    for (const remark of enriched.remarkRecords || []) {
      for (const file of remark.images || []) {
        const source = storedFilePath(file);
        if (!fs.existsSync(source)) continue;
        const target = path.join(taskDir, "remark-images", `${sanitizeFolderPart(file.uploadedByName, "上传者")}-${sanitizeFilename(file.originalName)}`);
        fs.copyFileSync(source, uniquePath(target));
      }
    }
  }

  createZipFromDirectory(archivePath, zipPath, path.dirname(archivePath));
  return {
    ok: true,
    archivedTasks: tasks.length,
    archivePath,
    zipPath,
  };
}

function archiveTaskFolderNameV2(db, task) {
  const assignee = db.users.find((item) => item.id === task.assigneeId);
  const name = renderRule(CONFIG.archiveTaskNameRule || "{title}-{wechat}_{orderNo}_{designer}", {
    title: task.title,
    wechat: task.wechat || "无微信",
    orderNo: task.orderNo || "无订单",
    designer: assignee?.name || "未分配",
    date: formatDate(),
  });
  return sanitizeFolderPart(name, "任务");
}

function renderRule(rule, values) {
  return String(rule || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function writeCommentTxt(filePath, comments) {
  const lines = comments.map((comment) => {
    const author = `${comment.authorName || "未知"}${comment.authorRole ? `（${roleName(comment.authorRole)}）` : ""}`;
    return `[${formatDateTimeText(comment.createdAt)}] ${author}: ${comment.text}`;
  });
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function writeRemarkTxt(filePath, records) {
  const lines = records.map((record) => {
    const imageCount = (record.images || []).length;
    const suffix = imageCount ? `（图片 ${imageCount} 张）` : "";
    return `[${formatDateTimeText(record.createdAt)}] ${record.authorName || "未知"}: ${record.text || ""}${suffix}`;
  });
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function roleName(role) {
  return { owner: "管理员", service: "客服", designer: "设计师" }[role] || "成员";
}

function formatDateTimeText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function uniqueDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return dirPath;
  let index = 2;
  while (true) {
    const next = `${dirPath}-${index}`;
    if (!fs.existsSync(next)) return next;
    index += 1;
  }
}

function createZipFromDirectory(sourceDir, zipPath, baseDir) {
  const files = listFilesRecursive(sourceDir);
  const fd = fs.openSync(zipPath, "w");
  const central = [];
  let offset = 0;

  try {
    for (const filePath of files) {
      const name = path.relative(baseDir, filePath).replace(/\\/g, "/");
      const nameBuffer = Buffer.from(name, "utf8");
      const stat = fs.statSync(filePath);
      if (stat.size > 0xffffffff) throw new Error(`文件过大，暂不支持归档：${name}`);
      const info = computeCrcAndSize(filePath);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(info.crc, 14);
      local.writeUInt32LE(info.size, 18);
      local.writeUInt32LE(info.size, 22);
      local.writeUInt16LE(nameBuffer.length, 26);
      local.writeUInt16LE(0, 28);
      fs.writeSync(fd, local);
      fs.writeSync(fd, nameBuffer);
      copyFileToFd(filePath, fd);

      central.push({ nameBuffer, crc: info.crc, size: info.size, offset });
      offset += local.length + nameBuffer.length + info.size;
    }

    const centralStart = offset;
    for (const item of central) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt16LE(0, 14);
      header.writeUInt32LE(item.crc, 16);
      header.writeUInt32LE(item.size, 20);
      header.writeUInt32LE(item.size, 24);
      header.writeUInt16LE(item.nameBuffer.length, 28);
      header.writeUInt16LE(0, 30);
      header.writeUInt16LE(0, 32);
      header.writeUInt16LE(0, 34);
      header.writeUInt16LE(0, 36);
      header.writeUInt32LE(0, 38);
      header.writeUInt32LE(item.offset, 42);
      fs.writeSync(fd, header);
      fs.writeSync(fd, item.nameBuffer);
      offset += header.length + item.nameBuffer.length;
    }

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - centralStart, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    fs.writeSync(fd, end);
  } finally {
    fs.closeSync(fd);
  }
}

function listFilesRecursive(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listFilesRecursive(fullPath));
    if (entry.isFile()) result.push(fullPath);
  }
  return result;
}

function computeCrcAndSize(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  let crc = 0xffffffff;
  let size = 0;
  try {
    while (true) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      size += bytes;
      for (let index = 0; index < bytes; index += 1) {
        crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return { crc: (crc ^ 0xffffffff) >>> 0, size };
}

function copyFileToFd(filePath, outFd) {
  const inFd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    while (true) {
      const bytes = fs.readSync(inFd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      fs.writeSync(outFd, buffer, 0, bytes);
    }
  } finally {
    fs.closeSync(inFd);
  }
}

module.exports = {
  handleArchiveDoneTasks,
  handleArchiveOneTask,
};
