const fs = require("fs");
const path = require("path");
const yazl = require("yazl");
const { ARCHIVE_DIR, CONFIG } = require("./config");
const { sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { enrichTask, publicUser, readComments, readDb, writeDb, writeJsonFile } = require("./storage");
const { requireUser } = require("./auth");
const { canArchiveTask, hasPermission } = require("./permissions");
const { insertArchiveRecord, insertOperationLog } = require("./repositories/system-repo");
const {
  contentDispositionHeader,
  formatArchiveStamp,
  formatDate,
  sanitizeFilename,
  sanitizeFolderPart,
  storedFilePath,
  uniquePath,
} = require("./files");

async function handleArchiveDoneTasks(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasPermission(user, "archives.manage")) {
    sendError(res, 403, "只有管理员可以归档");
    return;
  }

  const db = readDb();
  const tasks = db.tasks.filter((task) => canArchiveTask(user, task));
  if (!tasks.length) {
    sendError(res, 400, "没有可归档的已完成任务");
    return;
  }

  try {
    const archives = [];
    for (const task of tasks) {
      const result = await createTaskArchive(db, [task]);
      markTasksArchived(db, [task], result, user);
      archives.push(result);
    }
    sendJson(res, 200, {
      ok: true,
      archivedTasks: archives.length,
      archives,
    });
  } catch (error) {
    sendError(res, 500, `归档失败：${error.message}`);
  }
}

async function handleArchiveOneTask(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!hasPermission(user, "archives.manage")) {
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
    const result = await createTaskArchive(db, [task]);
    markTasksArchived(db, [task], result, user);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, `归档失败：${error.message}`);
  }
}

function handleDownloadTaskArchive(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasPermission(user, "archives.manage")) {
    sendError(res, 403, "只有管理员可以下载归档包");
    return;
  }

  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!task.archivedAt || !task.archiveZipPath) {
    sendError(res, 400, "该任务当前没有可下载的归档包");
    return;
  }

  const zipPath = path.resolve(task.archiveZipPath);
  const archiveRoot = path.resolve(ARCHIVE_DIR);
  if (!zipPath.startsWith(`${archiveRoot}${path.sep}`) && zipPath !== archiveRoot) {
    sendError(res, 400, "归档路径不合法");
    return;
  }
  if (!fs.existsSync(zipPath)) {
    sendError(res, 404, "归档包已丢失，请检查服务器归档目录");
    return;
  }

  const filename = `${sanitizeFilename(task.title || task.id)}-归档.zip`;
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Length": fs.statSync(zipPath).size,
    "Content-Disposition": contentDispositionHeader("attachment", filename),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(zipPath).pipe(res);
}

function markTasksArchived(db, tasks, archiveResult, user) {
  const now = new Date().toISOString();
  const comments = readComments();
  for (const task of tasks) {
    task.archivedAt = now;
    task.archiveZipPath = archiveResult.zipPath;
    task.updatedAt = now;
  }
  writeDb(db);
  for (const task of tasks) {
    const enriched = enrichTask(db, task, comments);
    insertArchiveRecord({
      taskId: task.id,
      archivePath: archiveResult.archivePath,
      zipPath: archiveResult.zipPath,
      archivedBy: user.id,
      archivedByName: user.name,
      archivedAt: now,
      taskSnapshot: enriched,
      fileCount: (enriched.attachments || []).length,
      commentCount: (enriched.comments || []).length,
    });
    insertOperationLog({
      userId: user.id,
      userName: user.name,
      action: "archive_task",
      targetType: "task",
      targetId: task.id,
      detail: `归档到 ${archiveResult.zipPath}`,
      createdAt: now,
    });
  }
  broadcast("tasks-changed", {});
}

async function createTaskArchive(db, tasks) {
  if (!Array.isArray(tasks) || tasks.length !== 1) {
    throw new Error("当前归档策略为项目级归档，每次只能打包一个任务");
  }

  const comments = readComments();
  const stamp = formatArchiveStamp();
  const task = tasks[0];
  const archiveName = renderRule(CONFIG.archiveNameRule || "任务归档-{date}-{time}-{taskId}", {
    date: formatDate(),
    time: stamp.split("-").pop(),
    count: tasks.length,
    taskId: task.id,
    title: task.title,
    wechat: task.wechat || "无微信",
    orderNo: task.orderNo || "无订单",
  });
  const archivePath = uniqueDirectory(path.join(ARCHIVE_DIR, sanitizeFolderPart(archiveName, "任务归档")));
  const zipPath = `${archivePath}.zip`;

  fs.mkdirSync(archivePath, { recursive: true });
  fs.mkdirSync(path.join(archivePath, "tasks"), { recursive: true });
  writeJsonFile(path.join(archivePath, "任务列表.json"), tasks.map((item) => {
    const enriched = enrichTask(db, item, comments);
    return { ...enriched, comments: undefined };
  }));
  writeJsonFile(path.join(archivePath, "账号列表.json"), db.users.map(publicUser));

  const taskDir = uniqueDirectory(path.join(archivePath, "tasks", archiveTaskFolderNameV2(db, task)));
  const enriched = enrichTask(db, task, comments);
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

  writeArchiveManifest(path.join(archivePath, "manifest.json"), {
    archiveVersion: 1,
    archiveType: "task-project",
    restoreMode: "future-import-or-rehydrate",
    taskId: task.id,
    archivedAt: new Date().toISOString(),
    taskSnapshot: enriched,
    files: enriched.attachments || [],
    comments: enriched.comments || [],
    remarkRecords: enriched.remarkRecords || [],
  });

  await createZipFromDirectory(archivePath, zipPath, path.dirname(archivePath));
  return {
    ok: true,
    archivedTasks: tasks.length,
    taskId: task.id,
    archivePath,
    zipPath,
  };
}

function writeArchiveManifest(filePath, data) {
  writeJsonFile(filePath, data);
}

function archiveTaskFolderNameV2(db, task) {
  const assignee = db.users.find((item) => item.id === task.assigneeId);
  const name = renderRule(CONFIG.archiveTaskNameRule || "{title}-{wechat}_{orderNo}_{designer}-{taskId}", {
    title: task.title,
    wechat: task.wechat || "无微信",
    orderNo: task.orderNo || "无订单",
    designer: assignee?.name || "未分配",
    date: formatDate(),
    taskId: task.id,
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
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    const output = fs.createWriteStream(zipPath);
    output.on("close", resolve);
    output.on("error", reject);
    zipfile.outputStream.on("error", reject);
    zipfile.outputStream.pipe(output);
    files.forEach((filePath) => {
      const name = path.relative(baseDir, filePath).replace(/\\/g, "/");
      zipfile.addFile(filePath, name);
    });
    zipfile.end();
  });
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

module.exports = {
  createTaskArchive,
  handleArchiveDoneTasks,
  handleArchiveOneTask,
  handleDownloadTaskArchive,
};
