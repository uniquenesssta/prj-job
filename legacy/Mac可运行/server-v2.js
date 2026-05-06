const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "config.json");
const CONFIG = loadConfig();
const DATA_DIR = resolveDataDir(CONFIG.dataDir);
const UPLOAD_DIR = resolveUploadDir(CONFIG.uploadDir);
const DB_FILE = path.join(DATA_DIR, "db.json");
const COMMENT_FILE = path.join(DATA_DIR, "comments.json");
const ARCHIVE_DIR = resolveArchiveDir(CONFIG.archiveDir);
const MAX_BODY_SIZE = 80 * 1024 * 1024;
const sessions = new Map();
const eventClients = new Set();

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (error) {
    console.warn(`config.json 读取失败，将使用默认配置：${error.message}`);
    return {};
  }
}

function resolveDataDir(dataDir) {
  const value = String(dataDir || "").trim();
  if (!value) return path.join(ROOT, "data");
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function resolveUploadDir(uploadDir) {
  const value = String(uploadDir || "").trim();
  if (!value) return path.join(DATA_DIR, "uploads");
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function resolveArchiveDir(archiveDir) {
  const value = String(archiveDir || "").trim();
  if (!value) return path.join(DATA_DIR, "archives");
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".psd": "application/octet-stream",
  ".ai": "application/postscript",
};

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR);
  if (!fs.existsSync(COMMENT_FILE)) fs.writeFileSync(COMMENT_FILE, "[]", "utf8");
  if (!fs.existsSync(DB_FILE)) {
    writeDb(seedDb());
    return;
  }
  migrateDb();
}

function seedDb() {
  const now = new Date().toISOString();
  return {
    users: [
      makeUser("u_admin", "admin", "管理员", "owner", "admin123"),
      makeUser("u_service", "kefu", "客服", "service", "service123"),
      makeUser("u_ming", "aming", "阿明", "designer", "design123"),
      makeUser("u_yan", "ayan", "阿言", "designer", "design123"),
      makeUser("u_qi", "aqi", "阿齐", "designer", "design123"),
    ],
    tasks: [
      {
        id: createId("task"),
        title: "奶茶品牌开业海报",
        description: "主视觉、门店立牌和朋友圈长图各一版，风格清爽、有夏日感。",
        wechat: "summer-tea",
        orderNo: "TB20260505001",
        taobaoId: "夏日茶铺",
        creatorId: "u_service",
        assigneeId: "u_ming",
        priority: "high",
        status: "doing",
        progress: 45,
        dueDate: "2026-05-10",
        createdAt: now,
        updatedAt: now,
        attachments: [],
      },
      {
        id: createId("task"),
        title: "服装店五一活动物料",
        description: "电商首页 banner、三张详情页氛围图，需保留品牌黑白基调。",
        wechat: "fashion-vip",
        orderNo: "TB20260505002",
        taobaoId: "黑白衣橱",
        creatorId: "u_service",
        assigneeId: "u_yan",
        priority: "normal",
        status: "review",
        progress: 80,
        dueDate: "2026-05-08",
        createdAt: now,
        updatedAt: now,
        attachments: [],
      },
      {
        id: createId("task"),
        title: "地产项目户外围挡",
        description: "根据客户给的 CAD 和文案做 3 个方向，注意大字远距离识别。",
        wechat: "house-design",
        orderNo: "TB20260505003",
        taobaoId: "城市置业旗舰店",
        creatorId: "u_service",
        assigneeId: "u_qi",
        priority: "urgent",
        status: "todo",
        progress: 10,
        dueDate: "2026-05-12",
        createdAt: now,
        updatedAt: now,
        attachments: [],
      },
    ],
    files: [],
  };
}

function migrateDb() {
  const db = readDb();
  const comments = readComments();
  let changed = false;

  if (!db.users.some((user) => user.role === "service")) {
    db.users.push(makeUser("u_service", "kefu", "客服", "service", "service123"));
    changed = true;
  }

  const fallbackCreator = db.users.find((user) => user.role === "service")?.id || db.users[0]?.id;
  if (Array.isArray(db.comments) && db.comments.length) {
    const existingComments = readComments();
    const existingIds = new Set(existingComments.map((comment) => comment.id));
    const merged = existingComments.concat(db.comments.filter((comment) => !existingIds.has(comment.id)));
    writeComments(merged);
    delete db.comments;
    changed = true;
  } else if (Object.hasOwn(db, "comments")) {
    delete db.comments;
    changed = true;
  }
  db.tasks.forEach((task) => {
    if (!task.creatorId) {
      task.creatorId = fallbackCreator;
      changed = true;
    }
    for (const field of ["wechat", "orderNo", "taobaoId"]) {
      if (task[field] === undefined) {
        task[field] = "";
        changed = true;
      }
    }
    if (!Array.isArray(task.attachments)) {
      task.attachments = [];
      changed = true;
    }
    if (task.archivedAt === undefined) {
      task.archivedAt = "";
      changed = true;
    }
    if (task.archiveZipPath === undefined) {
      task.archiveZipPath = "";
      changed = true;
    }
  });

  if (changed) writeDb(db);
}

function makeUser(id, username, name, role, password) {
  return {
    id,
    username,
    name,
    role,
    passwordHash: hashPassword(password),
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(next));
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function readComments() {
  if (!fs.existsSync(COMMENT_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(COMMENT_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeComments(comments) {
  fs.writeFileSync(COMMENT_FILE, JSON.stringify(comments, null, 2), "utf8");
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req, limit = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("上传内容过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req, 2 * 1024 * 1024);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim().split("="))
      .filter((pair) => pair.length === 2)
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}

function getUserFromRequest(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return readDb().users.find((user) => user.id === session.userId) || null;
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendError(res, 401, "请先登录");
    return null;
  }
  return user;
}

function canAccessTask(user, task) {
  return user.role === "owner" || task.assigneeId === user.id || task.creatorId === user.id;
}

function canEditBrief(user, task) {
  return user.role === "owner" || (user.role === "service" && task.creatorId === user.id);
}

function enrichTask(db, task, comments = readComments()) {
  const assignee = db.users.find((user) => user.id === task.assigneeId);
  const creator = db.users.find((user) => user.id === task.creatorId);
  return {
    ...task,
    assigneeName: assignee ? assignee.name : "未分配",
    creatorName: creator ? creator.name : "未知",
    attachments: task.attachments
      .map((fileId) => {
        const file = db.files.find((item) => item.id === fileId);
        if (!file) return null;
        const uploader = db.users.find((user) => user.id === file.uploadedBy);
        return {
          ...file,
          uploadedByRole: file.uploadedByRole || uploader?.role || "unknown",
        };
      })
      .filter(Boolean),
    comments: comments
      .filter((comment) => comment.taskId === task.id)
      .map((comment) => {
        const author = db.users.find((user) => user.id === comment.authorId);
        return {
          ...comment,
          authorName: author ? author.name : "未知",
          authorRole: author ? author.role : "unknown",
        };
      }),
  };
}

function broadcast(type, payload = {}) {
  const data = `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of eventClients) {
    res.write(data);
  }
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/app-v2.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}data${path.sep}`)) {
    sendError(res, 403, "无权访问该文件");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendError(res, 404, "页面不存在");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleLogin(req, res) {
  const { username, password } = await readJson(req);
  const user = readDb().users.find((item) => item.username === String(username || "").trim());
  if (!user || !verifyPassword(String(password || ""), user.passwordHash)) {
    sendError(res, 401, "账号或密码不正确");
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 12 });
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
  sendJson(res, 200, { user: publicUser(user) });
}

function handleLogout(req, res) {
  const token = parseCookies(req).session;
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  sendJson(res, 200, { ok: true });
}

function handleMe(req, res) {
  const user = requireUser(req, res);
  if (user) sendJson(res, 200, { user: publicUser(user) });
}

function handleUsers(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const allUsers = readDb().users;
  const visibleUsers =
    user.role === "owner"
      ? allUsers
      : user.role === "service"
        ? allUsers.filter((item) => item.role === "designer" || item.id === user.id)
        : allUsers.filter((item) => item.id === user.id);
  const users = visibleUsers.map(publicUser);
  sendJson(res, 200, { users });
}

async function handleCreateUser(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以新增账号");
    return;
  }
  const body = await readJson(req);
  const username = String(body.username || "").trim();
  const name = String(body.name || "").trim();
  const password = String(body.password || "").trim();
  const role = ["designer", "service", "owner"].includes(body.role) ? body.role : "designer";
  if (!username || !name || password.length < 6) {
    sendError(res, 400, "请填写姓名、账号和至少 6 位密码");
    return;
  }
  const db = readDb();
  if (db.users.some((item) => item.username === username)) {
    sendError(res, 409, "这个账号已经存在");
    return;
  }
  const nextUser = makeUser(createId("user"), username, name, role, password);
  db.users.push(nextUser);
  writeDb(db);
  broadcast("users-changed", { userId: nextUser.id });
  sendJson(res, 201, { user: publicUser(nextUser) });
}

async function handleUpdateUser(req, res, userId) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以修改账号");
    return;
  }

  const body = await readJson(req);
  const db = readDb();
  const target = db.users.find((item) => item.id === userId);
  if (!target) {
    sendError(res, 404, "账号不存在");
    return;
  }

  const username = String(body.username ?? target.username).trim();
  const name = String(body.name ?? target.name).trim();
  const role = ["designer", "service", "owner"].includes(body.role) ? body.role : target.role;
  const password = String(body.password || "").trim();

  if (!username || !name) {
    sendError(res, 400, "姓名和账号不能为空");
    return;
  }
  if (db.users.some((item) => item.id !== target.id && item.username === username)) {
    sendError(res, 409, "这个账号已经存在");
    return;
  }
  if (password && password.length < 6) {
    sendError(res, 400, "新密码至少 6 位");
    return;
  }
  if (target.role === "owner" && role !== "owner") {
    const ownerCount = db.users.filter((item) => item.role === "owner").length;
    if (ownerCount <= 1) {
      sendError(res, 400, "至少需要保留一个管理员账号");
      return;
    }
  }

  target.username = username;
  target.name = name;
  target.role = role;
  if (password) target.passwordHash = hashPassword(password);
  writeDb(db);
  broadcast("users-changed", { userId: target.id });
  sendJson(res, 200, { user: publicUser(target) });
}

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
  if (!["owner", "service"].includes(user.role)) {
    sendError(res, 403, "只有管理员和客服可以新建任务");
    return;
  }
  const body = await readJson(req);
  const db = readDb();
  const comments = readComments();
  const assignee = db.users.find((item) => item.id === body.assigneeId && item.role === "designer");
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

async function handleUpload(req, res, taskId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
    return;
  }
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权上传到该任务");
    return;
  }
  const boundary = (req.headers["content-type"] || "").match(/boundary=(.+)$/)?.[1];
  if (!boundary) {
    sendError(res, 400, "上传格式不正确");
    return;
  }
  const file = parseMultipartFile(await readBody(req), boundary);
  if (!file || !file.data.length) {
    sendError(res, 400, "请选择要上传的文件");
    return;
  }
  const originalName = sanitizeFilename(file.filename || "upload.bin");
  const id = createId("file");
  const storedName = `${id}${path.extname(originalName)}`;
  const folderName = taskUploadFolderName(db, task, "上传");
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
    uploadedBy: user.id,
    uploadedByName: user.name,
    uploadedByRole: user.role,
    uploadedAt: new Date().toISOString(),
  };
  db.files.push(record);
  task.attachments.push(record.id);
  task.updatedAt = new Date().toISOString();
  writeDb(db);
  broadcast("files-changed", { taskId: task.id, fileId: record.id });
  sendJson(res, 201, { file: record, task: enrichTask(db, task) });
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
  if (!canAccessTask(user, task)) {
    sendError(res, 403, "无权留言");
    return;
  }
  const body = await readJson(req);
  const text = String(body.text || "").trim();
  if (!text) {
    sendError(res, 400, "请输入留言内容");
    return;
  }
  const comment = {
    id: createId("comment"),
    taskId,
    authorId: user.id,
    text,
    createdAt: new Date().toISOString(),
  };
  const comments = readComments();
  comments.push(comment);
  writeComments(comments);
  task.updatedAt = new Date().toISOString();
  writeDb(db);
  broadcast("comments-changed", { taskId, commentId: comment.id });
  sendJson(res, 201, { comment });
}

function parseMultipartFile(buffer, boundary) {
  let start = buffer.indexOf(Buffer.from(`--${boundary}`));
  while (start !== -1) {
    const headerStart = start + boundary.length + 4;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) return null;
    const header = buffer.slice(headerStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
    if (nextBoundary === -1) return null;
    if (header.includes('name="file"')) {
      return {
        filename: header.match(/filename="([^"]*)"/)?.[1] || "upload.bin",
        contentType: header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream",
        data: buffer.slice(dataStart, nextBoundary),
      };
    }
    start = buffer.indexOf(Buffer.from(`--${boundary}`), nextBoundary + boundary.length);
  }
  return null;
}

function sanitizeFilename(filename) {
  return (path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 160) || "upload.bin");
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
  return path.join(UPLOAD_DIR, file.relativePath || file.storedName);
}

function handleDownload(req, res, fileId) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const file = db.files.find((item) => item.id === fileId);
  if (!file) {
    sendError(res, 404, "文件不存在");
    return;
  }
  const task = db.tasks.find((item) => item.id === file.taskId);
  if (!task || !canAccessTask(user, task)) {
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
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleArchive(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以归档");
    return;
  }

  const db = readDb();
  const stamp = formatArchiveStamp();
  const archiveName = `任务归档-${stamp}`;
  const archivePath = path.join(ARCHIVE_DIR, archiveName);
  const zipPath = `${archivePath}.zip`;

  fs.mkdirSync(archivePath, { recursive: true });
  fs.mkdirSync(path.join(archivePath, "tasks"), { recursive: true });
  writeJsonFile(path.join(archivePath, "全部任务.json"), db.tasks.map((task) => enrichTask(db, task)));
  writeJsonFile(path.join(archivePath, "全部留言.json"), db.comments || []);
  writeJsonFile(path.join(archivePath, "账号列表.json"), db.users.map(publicUser));

  for (const task of db.tasks) {
    const enriched = enrichTask(db, task);
    const taskDir = path.join(archivePath, "tasks", archiveTaskFolderName(db, task));
    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(path.join(taskDir, "files"), { recursive: true });
    writeJsonFile(path.join(taskDir, "任务信息.json"), enriched);
    writeJsonFile(path.join(taskDir, "留言.json"), enriched.comments || []);

    for (const file of enriched.attachments || []) {
      const source = storedFilePath(file);
      if (!fs.existsSync(source)) continue;
      const target = path.join(taskDir, "files", `${sanitizeFolderPart(file.uploadedByName, "上传者")}-${sanitizeFilename(file.originalName)}`);
      fs.copyFileSync(source, uniquePath(target));
    }
  }

  try {
    createZipFromDirectory(archivePath, zipPath, path.dirname(archivePath));
  } catch (error) {
    sendError(res, 500, `归档已生成但压缩失败：${error.message}`);
    return;
  }

  sendJson(res, 200, {
    ok: true,
    archivePath,
    zipPath,
  });
}

function archiveTaskFolderName(db, task) {
  const assignee = db.users.find((item) => item.id === task.assigneeId);
  return sanitizeFolderPart(`${task.title}-${task.wechat || "无微信"}_${task.orderNo || "无订单"}_${assignee?.name || "未分配"}`, "任务");
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function handleArchiveDoneTasks(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以归档");
    return;
  }
  const db = readDb();
  const tasks = db.tasks.filter((task) => task.status === "done" && !task.archivedAt);
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
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以归档任务");
    return;
  }
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    sendError(res, 404, "任务不存在");
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
    writeJsonFile(path.join(taskDir, "任务信息.json"), { ...enriched, comments: undefined });
    writeCommentTxt(path.join(taskDir, "留言.txt"), enriched.comments || []);

    for (const file of enriched.attachments || []) {
      const source = storedFilePath(file);
      if (!fs.existsSync(source)) continue;
      const target = path.join(taskDir, "files", `${sanitizeFolderPart(file.uploadedByName, "上传者")}-${sanitizeFilename(file.originalName)}`);
      fs.copyFileSync(source, uniquePath(target));
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

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

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

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  Promise.resolve()
    .then(async () => {
      if (req.method === "POST" && pathname === "/api/login") return handleLogin(req, res);
      if (req.method === "POST" && pathname === "/api/logout") return handleLogout(req, res);
      if (req.method === "GET" && pathname === "/api/me") return handleMe(req, res);
      if (req.method === "GET" && pathname === "/api/events") return handleEvents(req, res);
      if (req.method === "GET" && pathname === "/api/users") return handleUsers(req, res);
      if (req.method === "POST" && pathname === "/api/users") return handleCreateUser(req, res);
      const userUpdate = pathname.match(/^\/api\/users\/([^/]+)$/);
      if (req.method === "PATCH" && userUpdate) return handleUpdateUser(req, res, userUpdate[1]);
      if (req.method === "POST" && pathname === "/api/archive") return handleArchiveDoneTasks(req, res);
      if (req.method === "GET" && pathname === "/api/tasks") return handleGetTasks(req, res);
      if (req.method === "POST" && pathname === "/api/tasks") return handleCreateTask(req, res);
      const taskArchive = pathname.match(/^\/api\/tasks\/([^/]+)\/archive$/);
      if (req.method === "POST" && taskArchive) return handleArchiveOneTask(req, res, taskArchive[1]);
      const taskRestore = pathname.match(/^\/api\/tasks\/([^/]+)\/restore$/);
      if (req.method === "POST" && taskRestore) return handleRestoreTask(req, res, taskRestore[1]);
      const taskUpdate = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (req.method === "PATCH" && taskUpdate) return handleUpdateTask(req, res, taskUpdate[1]);
      const upload = pathname.match(/^\/api\/tasks\/([^/]+)\/upload$/);
      if (req.method === "POST" && upload) return handleUpload(req, res, upload[1]);
      const comment = pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
      if (req.method === "POST" && comment) return handleCreateComment(req, res, comment[1]);
      const download = pathname.match(/^\/api\/files\/([^/]+)$/);
      if (req.method === "GET" && download) return handleDownload(req, res, download[1]);
      if (req.method === "GET") return serveStatic(req, res, pathname);
      sendError(res, 405, "不支持的请求");
    })
    .catch((error) => {
      console.error(error);
      if (!res.headersSent) sendError(res, 500, error.message || "服务器错误");
    });
}

function handleEvents(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  eventClients.add(res);
  req.on("close", () => {
    eventClients.delete(res);
  });
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
}

ensureStorage();
http.createServer(route).listen(PORT, "0.0.0.0", () => {
  console.log(`设计任务执行台已启动：http://localhost:${PORT}`);
  getLanAddresses().forEach((address) => console.log(`局域网访问：${address}`));
  console.log(`上传目录：${UPLOAD_DIR}`);
  console.log("默认管理员：admin / admin123");
  console.log("默认客服：kefu / service123");
  console.log("默认设计师：aming / design123，ayan / design123，aqi / design123");
});
