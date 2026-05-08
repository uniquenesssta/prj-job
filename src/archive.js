const fs = require("fs");
const path = require("path");
const yazl = require("yazl");
const { ARCHIVE_DIR, CONFIG } = require("./config");
const { runInTransaction } = require("./database");
const { sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const { enrichTask, publicUser, readComments, readDb, writeDb, writeJsonFile } = require("./storage");
const { requireUser } = require("./auth");
const { canArchiveTask, hasPermission } = require("./permissions");
const { deleteFileRecord } = require("./repositories/files-repo");
const { detachFileFromAllTasks, updateTask } = require("./repositories/tasks-repo");
const { removeFileIdFromPersonalNotes } = require("./repositories/notes-repo");
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

  const integrity = scanArchiveIntegrity(db, { tasks });
  if (integrity.missingFiles.length || integrity.missingFileReferences.length) {
    sendArchiveIntegrityError(res, integrity);
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

  const integrity = scanArchiveIntegrity(db, { tasks: [task] });
  if (integrity.missingFiles.length || integrity.missingFileReferences.length) {
    sendArchiveIntegrityError(res, integrity);
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

function handleArchiveMissingFiles(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasPermission(user, "archives.manage")) {
    sendError(res, 403, "只有管理员可以扫描归档缺失文件");
    return;
  }
  const db = readDb();
  const integrity = scanArchiveIntegrity(db, {
    tasks: db.tasks.filter((task) => !task.deletedAt && (task.status === "done" || task.archivedAt)),
    includeArchivePackages: true,
  });
  sendJson(res, 200, integrity);
}

function handleDeleteMissingArchiveFile(req, res, fileId) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasPermission(user, "archives.manage")) {
    sendError(res, 403, "只有管理员可以清理归档缺失文件记录");
    return;
  }

  const db = readDb();
  const file = db.files.find((item) => item.id === fileId);
  if (file) {
    const source = storedFilePath(file);
    if (fs.existsSync(source)) {
      sendError(res, 400, "本地文件仍然存在，不能作为缺失文件记录删除");
      return;
    }
  }

  const affectedTasks = db.tasks.filter((task) => taskReferencesFile(task, fileId) || (file && task.id === file.taskId));
  if (!file && !affectedTasks.length) {
    sendError(res, 404, "没有找到可清理的缺失文件记录");
    return;
  }
  affectedTasks.forEach((task) => removeFileReferenceFromTask(task, fileId));

  runInTransaction((database) => {
    detachFileFromAllTasks(fileId, database);
    removeFileIdFromPersonalNotes(fileId, database);
    if (file) deleteFileRecord(fileId, database);
    affectedTasks.forEach((task) => updateTask(task, database));
  });

  const taskIds = affectedTasks.map((task) => task.id);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "archive_missing_file.clean",
    targetType: "file",
    targetId: fileId,
    detail: JSON.stringify({
      taskIds,
      originalName: file?.originalName || "missing_file_record",
      relativePath: file?.relativePath || "",
    }),
  });
  broadcast("files-changed", { taskIds, fileId, reason: "missing-file-cleaned" });
  broadcast("tasks-changed", { taskIds, reason: "missing-file-cleaned" });
  sendJson(res, 200, { ok: true, fileId, taskIds });
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
  if (!isPathInside(zipPath, archiveRoot)) {
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
  const archiveFiles = archiveFileRecordsForTask(db, task);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(taskDir, "files"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "remark-images"), { recursive: true });
  writeJsonFile(path.join(taskDir, "任务信息.json"), { ...enriched, comments: undefined });
  writeCommentTxt(path.join(taskDir, "留言.txt"), enriched.comments || []);
  writeRemarkTxt(path.join(taskDir, "个人备注.txt"), enriched.remarkRecords || []);

  for (const file of archiveFiles.attachments) {
    const source = storedFilePath(file);
    const target = path.join(taskDir, "files", `${sanitizeFolderPart(file.uploadedByName, "上传者")}-${sanitizeFilename(file.originalName)}`);
    fs.copyFileSync(source, uniquePath(target));
  }
  for (const file of archiveFiles.remarkImages) {
    const source = storedFilePath(file);
    const target = path.join(taskDir, "remark-images", `${sanitizeFolderPart(file.uploadedByName, "上传者")}-${sanitizeFilename(file.originalName)}`);
    fs.copyFileSync(source, uniquePath(target));
  }

  writeArchiveManifest(path.join(archivePath, "manifest.json"), {
    archiveVersion: 1,
    archiveType: "task-project",
    restoreMode: "future-import-or-rehydrate",
    taskId: task.id,
    archivedAt: new Date().toISOString(),
    taskSnapshot: enriched,
    files: archiveFiles.attachments,
    remarkImages: archiveFiles.remarkImages,
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

function taskReferencesFile(task, fileId) {
  const id = String(fileId || "");
  if (!task || !id) return false;
  if ((task.attachments || []).includes(id)) return true;
  return (task.remarkRecords || []).some((record) => (record.imageFileIds || []).includes(id));
}

function removeFileReferenceFromTask(task, fileId) {
  const id = String(fileId || "");
  task.attachments = (task.attachments || []).filter((attachmentId) => attachmentId !== id);
  task.remarkRecords = (task.remarkRecords || []).map((record) => ({
    ...record,
    imageFileIds: (record.imageFileIds || []).filter((imageId) => imageId !== id),
  }));
  task.updatedAt = new Date().toISOString();
}

function scanArchiveIntegrity(db, options = {}) {
  const tasks = Array.isArray(options.tasks) ? options.tasks : db.tasks.filter((task) => !task.deletedAt);
  const missingFiles = [];
  const missingFileReferences = [];
  const missingArchives = [];

  for (const task of tasks) {
    const expectedFiles = expectedArchiveFilesForTask(db, task);
    for (const item of expectedFiles) {
      if (!item.file) {
        missingFileReferences.push({
          taskId: task.id,
          taskTitle: task.title,
          fileId: item.fileId,
          source: item.source,
          reason: "文件记录不存在",
        });
        continue;
      }
      const filePath = storedFilePath(item.file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(formatMissingFile(task, item.file, filePath, item.source));
      }
    }

    if (options.includeArchivePackages && task.archivedAt && task.archiveZipPath) {
      const zipPath = path.resolve(task.archiveZipPath);
      const archiveRoot = path.resolve(ARCHIVE_DIR);
      const missing = !isPathInside(zipPath, archiveRoot) || !fs.existsSync(zipPath);
      if (missing) {
        missingArchives.push({
          taskId: task.id,
          taskTitle: task.title,
          zipPath: task.archiveZipPath,
          reason: !isPathInside(zipPath, archiveRoot) ? "归档路径不合法" : "归档包本地文件不存在",
        });
      }
    }
  }

  return {
    ok: missingFiles.length === 0 && missingFileReferences.length === 0 && missingArchives.length === 0,
    missingFiles,
    missingFileReferences,
    missingArchives,
    scannedTasks: tasks.length,
    scannedAt: new Date().toISOString(),
  };
}

function expectedArchiveFilesForTask(db, task) {
  const result = [];
  const seen = new Set();
  const pushFileId = (fileId, source) => {
    if (!fileId || seen.has(fileId)) return;
    seen.add(fileId);
    result.push({
      fileId,
      source,
      file: db.files.find((item) => item.id === fileId) || null,
    });
  };

  (task.attachments || []).forEach((fileId) => pushFileId(fileId, "task_attachment"));
  (task.remarkRecords || []).forEach((record) => {
    (record.imageFileIds || []).forEach((fileId) => pushFileId(fileId, "task_remark_image"));
  });
  db.files
    .filter((file) => file.taskId === task.id && file.storageArea === "remarkImage")
    .forEach((file) => pushFileId(file.id, "personal_note_image"));

  return result;
}

function archiveFileRecordsForTask(db, task) {
  const expected = expectedArchiveFilesForTask(db, task)
    .map((item) => item.file)
    .filter(Boolean);
  const attachmentIds = new Set(task.attachments || []);
  return {
    attachments: expected.filter((file) => attachmentIds.has(file.id) || file.storageArea !== "remarkImage"),
    remarkImages: expected.filter((file) => file.storageArea === "remarkImage"),
  };
}

function formatMissingFile(task, file, filePath, source) {
  return {
    taskId: task.id,
    taskTitle: task.title,
    fileId: file.id,
    originalName: file.originalName || file.storedName || file.id,
    usage: file.usage || "other",
    storageArea: file.storageArea || "upload",
    uploadedByName: file.uploadedByName || "未知",
    uploadedAt: file.uploadedAt || "",
    relativePath: file.relativePath || file.storedName || "",
    expectedPath: filePath,
    source,
    reason: "本地文件不存在",
  };
}

function sendArchiveIntegrityError(res, integrity) {
  const count = integrity.missingFiles.length + integrity.missingFileReferences.length;
  sendJson(res, 409, {
    error: `发现 ${count} 个缺失文件，已阻止归档。请在归档页删除缺失文件记录或重新上传后再归档。`,
    code: "ARCHIVE_MISSING_FILES",
    ...integrity,
  });
}

function isPathInside(targetPath, rootPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
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
  handleArchiveMissingFiles,
  handleArchiveOneTask,
  handleDeleteMissingArchiveFile,
  handleDownloadTaskArchive,
  scanArchiveIntegrity,
};
