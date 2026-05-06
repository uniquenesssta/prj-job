const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_BODY_SIZE = 80 * 1024 * 1024;

const sessions = new Map();

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
};

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
  if (!fs.existsSync(DB_FILE)) writeDb(seedDb());
}

function seedDb() {
  const users = [
    makeUser("u_admin", "admin", "管理员", "owner", "admin123"),
    makeUser("u_ming", "aming", "阿明", "designer", "design123"),
    makeUser("u_yan", "ayan", "阿言", "designer", "design123"),
    makeUser("u_qi", "aqi", "阿齐", "designer", "design123"),
  ];

  return {
    users,
    tasks: [
      {
        id: createId("task"),
        title: "奶茶品牌开业海报",
        description: "主视觉、门店立牌和朋友圈长图各一版，风格清爽、有夏日感。",
        assigneeId: "u_ming",
        priority: "high",
        status: "doing",
        progress: 45,
        dueDate: "2026-05-10",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [],
      },
      {
        id: createId("task"),
        title: "服装店五一活动物料",
        description: "电商首页 banner、三张详情页氛围图，需保留品牌黑白基调。",
        assigneeId: "u_yan",
        priority: "normal",
        status: "review",
        progress: 80,
        dueDate: "2026-05-08",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [],
      },
      {
        id: createId("task"),
        title: "地产项目户外围挡",
        description: "根据客户给的 CAD 和文案做 3 个方向，注意大字远距离识别。",
        assigneeId: "u_qi",
        priority: "urgent",
        status: "todo",
        progress: 10,
        dueDate: "2026-05-12",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [],
      },
    ],
    files: [],
  };
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
  const [salt, hash] = stored.split(":");
  const next = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(next));
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
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

function getUserFromRequest(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === session.userId);
  return user || null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
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
  return user.role === "owner" || task.assigneeId === user.id;
}

function enrichTask(db, task) {
  const assignee = db.users.find((user) => user.id === task.assigneeId);
  return {
    ...task,
    assigneeName: assignee ? assignee.name : "未分配",
    attachments: task.attachments.map((fileId) => db.files.find((file) => file.id === fileId)).filter(Boolean),
  };
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
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
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

async function handleLogin(req, res) {
  const { username, password } = await readJson(req);
  const db = readDb();
  const user = db.users.find((item) => item.username === String(username || "").trim());
  if (!user || !verifyPassword(String(password || ""), user.passwordHash)) {
    sendError(res, 401, "账号或密码不正确");
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 12,
  });
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
  if (!user) return;
  sendJson(res, 200, { user: publicUser(user) });
}

function handleUsers(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  sendJson(res, 200, { users: db.users.map(publicUser) });
}

async function handleCreateUser(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以新增成员");
    return;
  }

  const body = await readJson(req);
  const username = String(body.username || "").trim();
  const name = String(body.name || "").trim();
  const password = String(body.password || "").trim();
  if (!username || !name || password.length < 6) {
    sendError(res, 400, "请填写姓名、账号和至少 6 位密码");
    return;
  }

  const db = readDb();
  if (db.users.some((item) => item.username === username)) {
    sendError(res, 409, "这个账号已经存在");
    return;
  }

  const nextUser = makeUser(createId("user"), username, name, "designer", password);
  db.users.push(nextUser);
  writeDb(db);
  sendJson(res, 201, { user: publicUser(nextUser) });
}

function handleGetTasks(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const db = readDb();
  const tasks = db.tasks
    .filter((task) => canAccessTask(user, task))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .map((task) => enrichTask(db, task));
  sendJson(res, 200, { tasks });
}

async function handleCreateTask(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "owner") {
    sendError(res, 403, "只有管理员可以新建任务");
    return;
  }

  const body = await readJson(req);
  const db = readDb();
  const assignee = db.users.find((item) => item.id === body.assigneeId);
  if (!body.title || !assignee) {
    sendError(res, 400, "请填写任务标题并选择负责人");
    return;
  }

  const now = new Date().toISOString();
  const task = {
    id: createId("task"),
    title: String(body.title).trim(),
    description: String(body.description || "").trim(),
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
  sendJson(res, 201, { task: enrichTask(db, task) });
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

  const ownerOnlyFields = ["title", "description", "assigneeId", "dueDate", "priority"];
  if (user.role !== "owner" && ownerOnlyFields.some((field) => Object.hasOwn(body, field))) {
    sendError(res, 403, "成员只能更新进度和状态");
    return;
  }

  if (body.title !== undefined) task.title = String(body.title).trim();
  if (body.description !== undefined) task.description = String(body.description).trim();
  if (body.assigneeId !== undefined && db.users.some((item) => item.id === body.assigneeId)) task.assigneeId = body.assigneeId;
  if (body.dueDate !== undefined) task.dueDate = String(body.dueDate).trim();
  if (["low", "normal", "high", "urgent"].includes(body.priority)) task.priority = body.priority;
  if (["todo", "doing", "review", "done", "blocked"].includes(body.status)) task.status = body.status;
  if (body.progress !== undefined) task.progress = Math.max(0, Math.min(100, Number(body.progress) || 0));
  task.updatedAt = new Date().toISOString();
  writeDb(db);
  sendJson(res, 200, { task: enrichTask(db, task) });
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

  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) {
    sendError(res, 400, "上传格式不正确");
    return;
  }

  const body = await readBody(req);
  const file = parseMultipartFile(body, boundary);
  if (!file || !file.data.length) {
    sendError(res, 400, "请选择要上传的文件");
    return;
  }

  const originalName = sanitizeFilename(file.filename || "upload.bin");
  const id = createId("file");
  const storedName = `${id}${path.extname(originalName)}`;
  const storedPath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(storedPath, file.data);

  const record = {
    id,
    taskId,
    originalName,
    storedName,
    size: file.data.length,
    mimeType: file.contentType || "application/octet-stream",
    uploadedBy: user.id,
    uploadedByName: user.name,
    uploadedAt: new Date().toISOString(),
  };
  db.files.push(record);
  task.attachments.push(record.id);
  task.updatedAt = new Date().toISOString();
  writeDb(db);
  sendJson(res, 201, { file: record, task: enrichTask(db, task) });
}

function parseMultipartFile(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    const headerStart = start + boundaryBuffer.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) return null;
    const header = buffer.slice(headerStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
    if (nextBoundary === -1) return null;
    if (header.includes('name="file"')) {
      const filename = header.match(/filename="([^"]*)"/)?.[1] || "upload.bin";
      const contentType = header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
      return {
        filename,
        contentType,
        data: buffer.slice(dataStart, nextBoundary),
      };
    }
    start = buffer.indexOf(boundaryBuffer, nextBoundary + boundaryBuffer.length);
  }
  return null;
}

function sanitizeFilename(filename) {
  const base = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return base.slice(0, 160) || "upload.bin";
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
  const filePath = path.join(UPLOAD_DIR, file.storedName);
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

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  Promise.resolve()
    .then(async () => {
      if (req.method === "POST" && pathname === "/api/login") return handleLogin(req, res);
      if (req.method === "POST" && pathname === "/api/logout") return handleLogout(req, res);
      if (req.method === "GET" && pathname === "/api/me") return handleMe(req, res);
      if (req.method === "GET" && pathname === "/api/users") return handleUsers(req, res);
      if (req.method === "POST" && pathname === "/api/users") return handleCreateUser(req, res);
      if (req.method === "GET" && pathname === "/api/tasks") return handleGetTasks(req, res);
      if (req.method === "POST" && pathname === "/api/tasks") return handleCreateTask(req, res);

      const taskUpdate = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (req.method === "PATCH" && taskUpdate) return handleUpdateTask(req, res, taskUpdate[1]);

      const upload = pathname.match(/^\/api\/tasks\/([^/]+)\/upload$/);
      if (req.method === "POST" && upload) return handleUpload(req, res, upload[1]);

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

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
}

ensureStorage();

http.createServer(route).listen(PORT, "0.0.0.0", () => {
  console.log(`项目执行系统已启动：http://localhost:${PORT}`);
  getLanAddresses().forEach((address) => console.log(`局域网访问：${address}`));
  console.log("默认管理员：admin / admin123");
  console.log("默认成员：aming / design123，ayan / design123，aqi / design123");
});
