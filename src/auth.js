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
const { insertOperationLog } = require("./repositories/system-repo");

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
    insertOperationLog({
      action: "auth.login.failed",
      targetType: "user",
      targetTitle: String(username || "").trim(),
      detail: "账号或密码不正确",
    });
    sendError(res, 401, "账号或密码不正确");
    return;
  }
  if (user.disabledAt || user.deletedAt) {
    insertOperationLog({
      userId: user.id,
      userName: user.name,
      action: "auth.login.failed",
      targetType: "user",
      targetId: user.id,
      targetTitle: user.username,
      detail: "账号已禁用或删除",
    });
    sendError(res, 403, "账号已被禁用，请联系管理员");
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 12 });
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "auth.login.success",
    targetType: "user",
    targetId: user.id,
    targetTitle: user.username,
  });
  sendJson(res, 200, { user: publicUser(user) });
}

function handleLogout(req, res) {
  const token = parseCookies(req).session;
  const user = token ? getUserFromRequest(req) : null;
  if (token) sessions.delete(token);
  if (user) {
    insertOperationLog({
      userId: user.id,
      userName: user.name,
      action: "auth.logout",
      targetType: "user",
      targetId: user.id,
      targetTitle: user.username,
    });
  }
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
      ? allUsers.filter((item) => !item.deletedAt)
      : user.role === "service"
        ? allUsers.filter((item) => !item.deletedAt && (item.role === "designer" || item.id === user.id))
        : allUsers.filter((item) => !item.deletedAt && item.id === user.id);
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
  if (body.departmentId) nextUser.departmentId = String(body.departmentId).trim();
  if (body.customPermissions !== undefined) nextUser.customPermissions = normalizeCustomPermissions(body.customPermissions);
  if (body.disabled === true || body.disabled === "true") nextUser.disabledAt = new Date().toISOString();
  db.users.push(nextUser);
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "user.create",
    targetType: "user",
    targetId: nextUser.id,
    targetTitle: nextUser.username,
    detail: `新增账号 ${nextUser.username}`,
  });
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
  const departmentId = body.departmentId !== undefined ? String(body.departmentId || "").trim() : target.departmentId;
  const customPermissions = body.customPermissions !== undefined ? normalizeCustomPermissions(body.customPermissions) : target.customPermissions;
  const disabledRequested = body.disabled !== undefined ? body.disabled === true || body.disabled === "true" : Boolean(target.disabledAt);
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
  if (target.role === "owner" && disabledRequested && !target.disabledAt) {
    const activeOwnerCount = db.users.filter((item) => item.role === "owner" && !item.disabledAt && !item.deletedAt).length;
    if (activeOwnerCount <= 1) {
      sendError(res, 400, "至少需要保留一个启用的管理员账号");
      return;
    }
  }

  target.username = username;
  target.name = name;
  target.role = role;
  target.departmentId = departmentId;
  target.customPermissions = customPermissions;
  if (body.disabled !== undefined) target.disabledAt = disabledRequested ? target.disabledAt || new Date().toISOString() : "";
  if (password) target.passwordHash = hashPassword(password);
  writeDb(db);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: body.disabled !== undefined ? (disabledRequested ? "user.disable" : "user.enable") : "user.update",
    targetType: "user",
    targetId: target.id,
    targetTitle: target.username,
    detail: `修改账号 ${target.username}`,
  });
  broadcast("users-changed", { userId: target.id });
  sendJson(res, 200, { user: publicUser(target) });
}

function normalizeCustomPermissions(value) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(normalizePermissionObject(JSON.parse(value)));
    } catch {
      return "{}";
    }
  }
  return JSON.stringify(normalizePermissionObject(value || {}));
}

function normalizePermissionObject(value) {
  return {
    extra: Array.isArray(value.extra) ? value.extra.map(String) : [],
    disabled: Array.isArray(value.disabled) ? value.disabled.map(String) : [],
  };
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
