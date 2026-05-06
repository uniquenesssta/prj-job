const crypto = require("crypto");
const { parseCookies, readJson, sendError, sendJson } = require("./http-utils");
const { broadcast } = require("./events");
const {
  createId,
  hashPassword,
  makeUser,
  publicUser,
  readDb,
  verifyPassword,
  writeDb,
} = require("./storage");
const { canManageUsers } = require("./permissions");

const sessions = new Map();

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
  if (!canManageUsers(user)) {
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
  if (!canManageUsers(user)) {
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

module.exports = {
  handleCreateUser,
  handleLogin,
  handleLogout,
  handleMe,
  handleUpdateUser,
  handleUsers,
  requireUser,
};
