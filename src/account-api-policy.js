const { broadcast } = require("./events");
const { readJson, sendError, sendJson } = require("./http-utils");
const { requireUser } = require("./auth");
const { getDatabase } = require("./database");
const { createId, hashPassword, readDb } = require("./storage");
const { canManageUsers, hasAnyPermission, hasPermission, resolveUserPermissionCodes } = require("./permissions");
const { insertOperationLog } = require("./repositories/system-repo");
const { updateTask } = require("./repositories/tasks-repo");
const { applyDisableTransfer, validateDisableTransfer } = require("./user-disable-transfer");

const SUPER_ADMIN_USERNAME = "admin";
const MANAGED_ROLES = new Set(["designer", "service", "custom"]);
const USER_SECRET_COLUMN = "passwordHash";

function requireAccountManager(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!canManageUsers(user)) {
    sendError(res, 403, "当前账号没有账号管理权限");
    return null;
  }
  return user;
}

function ensureAccountPolicySchema() {
  const db = getDatabase();
  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("customRoleName")) db.exec("ALTER TABLE users ADD COLUMN customRoleName TEXT NOT NULL DEFAULT ''");
}

function handlePolicyUsers(req, res) {
  const currentUser = requireUser(req, res);
  if (!currentUser) return;
  ensureAccountPolicySchema();
  const allUsers = readDb().users;
  const canViewAllUsers = hasAnyPermission(currentUser, ["users.manage", "tasks.read_all"]);
  const visibleUsers = allUsers.filter((item) => {
    if (item.deletedAt) return false;
    if (canViewAllUsers || item.id === currentUser.id) return true;
    if (item.role === "designer" && hasPermission(currentUser, "views.other_designers")) return true;
    if (item.role === "service" && hasPermission(currentUser, "views.other_services")) return true;
    if (currentUser.role === "service" && item.role === "designer") return true;
    return false;
  });
  sendJson(res, 200, { users: visibleUsers.map(publicPolicyUser) });
}

async function handlePolicyCreateUser(req, res) {
  const admin = requireAccountManager(req, res);
  if (!admin) return;
  ensureAccountPolicySchema();
  const body = await readJson(req);
  const username = String(body.username || "").trim();
  const name = String(body.name || "").trim();
  const password = String(body.password || "").trim();
  const role = normalizeManagedRole(body.role);
  const customRoleName = normalizeCustomRoleName(role, body.customRoleName);
  const departmentId = String(body.departmentId || "").trim();
  if (!username || !name || password.length < 6) {
    sendError(res, 400, "请填写姓名、账号和至少 6 位密码");
    return;
  }
  if (username === SUPER_ADMIN_USERNAME) {
    sendError(res, 400, "admin 是最高管理员账号，不能重复创建");
    return;
  }
  if (String(body.role || "").trim() === "owner") {
    sendError(res, 400, "不能新增管理员账号");
    return;
  }
  if (role === "custom" && !customRoleName) {
    sendError(res, 400, "自定义角色需要填写角色名称");
    return;
  }
  const db = getDatabase();
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    sendError(res, 409, "这个账号已经存在");
    return;
  }
  const now = new Date().toISOString();
  const customPermissions = role === "custom" && !departmentId ? "{}" : normalizeCustomPermissions(body.customPermissions);
  const user = {
    id: createId("user"),
    username,
    name,
    role,
    customRoleName,
    departmentId,
    customPermissions,
    disabledAt: body.disabled === true || body.disabled === "true" ? now : "",
    deletedAt: "",
  };
  db.prepare(`
    INSERT INTO users (id, username, name, role, customRoleName, departmentId, customPermissions, disabledAt, deletedAt, ${USER_SECRET_COLUMN})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.username, user.name, user.role, user.customRoleName, user.departmentId, user.customPermissions, user.disabledAt, user.deletedAt, hashPassword(password));
  insertOperationLog({
    userId: admin.id,
    userName: admin.name,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    targetTitle: user.username,
    detail: JSON.stringify({ role, customRoleName, departmentId }),
  });
  broadcast("users-changed", { userId: user.id });
  sendJson(res, 201, { user: publicPolicyUser(user) });
}

async function handlePolicyUpdateUser(req, res, userId) {
  const admin = requireAccountManager(req, res);
  if (!admin) return;
  ensureAccountPolicySchema();
  const body = await readJson(req);
  const db = getDatabase();
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!target) {
    sendError(res, 404, "账号不存在");
    return;
  }
  const password = String(body.password || "").trim();
  if (password && password.length < 6) {
    sendError(res, 400, "新密码至少 6 位");
    return;
  }
  if (target.username === SUPER_ADMIN_USERNAME) {
    if (admin.username !== SUPER_ADMIN_USERNAME) {
      sendError(res, 403, "最高管理员 admin 只能由 admin 自己修改");
      return;
    }
    if (String(body.username || target.username).trim() !== SUPER_ADMIN_USERNAME) {
      sendError(res, 400, "admin 账号名不可变更");
      return;
    }
    if (password) db.prepare(`UPDATE users SET ${USER_SECRET_COLUMN} = ? WHERE id = ?`).run(hashPassword(password), target.id);
    insertOperationLog({
      userId: admin.id,
      userName: admin.name,
      action: "user.update_password",
      targetType: "user",
      targetId: target.id,
      targetTitle: target.username,
      detail: "最高管理员 admin 仅允许修改密码",
    });
    broadcast("users-changed", { userId: target.id });
    sendJson(res, 200, { user: publicPolicyUser({ ...target }) });
    return;
  }
  if (String(body.role || "").trim() === "owner") {
    sendError(res, 400, "不能把账号改为管理员");
    return;
  }
  const username = String(body.username ?? target.username).trim();
  const name = String(body.name ?? target.name).trim();
  const role = body.role !== undefined ? normalizeManagedRole(body.role) : normalizeManagedRole(target.role);
  const customRoleName = body.customRoleName !== undefined
    ? normalizeCustomRoleName(role, body.customRoleName)
    : normalizeCustomRoleName(role, target.customRoleName);
  const departmentId = body.departmentId !== undefined ? String(body.departmentId || "").trim() : target.departmentId || "";
  let customPermissions = body.customPermissions !== undefined ? normalizeCustomPermissions(body.customPermissions) : target.customPermissions || "{}";
  const disabledRequested = body.disabled !== undefined ? body.disabled === true || body.disabled === "true" : Boolean(target.disabledAt);
  const isNewDisable = body.disabled !== undefined && disabledRequested && !target.disabledAt;
  if (!username || !name) {
    sendError(res, 400, "姓名和账号不能为空");
    return;
  }
  if (username === SUPER_ADMIN_USERNAME) {
    sendError(res, 400, "不能把普通账号改名为 admin");
    return;
  }
  if (role === "custom" && !customRoleName) {
    sendError(res, 400, "自定义角色需要填写角色名称");
    return;
  }
  if (role === "custom" && !departmentId) customPermissions = "{}";
  const exists = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, target.id);
  if (exists) {
    sendError(res, 409, "这个账号已经存在");
    return;
  }
  const data = readDb();
  const transferTarget = data.users.find((user) => user.id === target.id) || target;
  const validation = isNewDisable ? validateDisableTransfer(data, transferTarget, body) : { ok: true };
  if (!validation.ok) {
    sendError(res, 409, validation.error);
    return;
  }
  const disabledAt = body.disabled !== undefined ? (disabledRequested ? target.disabledAt || new Date().toISOString() : "") : target.disabledAt || "";
  if (password) {
    db.prepare(`
      UPDATE users
      SET username = ?, name = ?, role = ?, customRoleName = ?, departmentId = ?, customPermissions = ?, disabledAt = ?, ${USER_SECRET_COLUMN} = ?
      WHERE id = ?
    `).run(username, name, role, customRoleName, departmentId, customPermissions, disabledAt, hashPassword(password), target.id);
  } else {
    db.prepare(`
      UPDATE users
      SET username = ?, name = ?, role = ?, customRoleName = ?, departmentId = ?, customPermissions = ?, disabledAt = ?
      WHERE id = ?
    `).run(username, name, role, customRoleName, departmentId, customPermissions, disabledAt, target.id);
  }
  const transferResult = isNewDisable ? applyDisableTransfer(data, transferTarget, validation, disabledAt) : null;
  if (transferResult?.affected) persistTaskResponsibilityChanges(data.tasks);
  insertOperationLog({
    userId: admin.id,
    userName: admin.name,
    action: body.disabled !== undefined ? (disabledRequested ? "user.disable" : "user.enable") : "user.update",
    targetType: "user",
    targetId: target.id,
    targetTitle: username,
    detail: JSON.stringify({ role, customRoleName, departmentId, disableTransfer: transferResult }),
  });
  broadcast("users-changed", { userId: target.id });
  broadcast("tasks-changed", { userId: target.id });
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(target.id);
  sendJson(res, 200, { user: publicPolicyUser(updated) });
}

async function handlePolicyDeleteUser(req, res, userId) {
  const admin = requireAccountManager(req, res);
  if (!admin) return;
  ensureAccountPolicySchema();
  const db = getDatabase();
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!target) {
    sendError(res, 404, "账号不存在");
    return;
  }
  if (target.username === SUPER_ADMIN_USERNAME) {
    sendError(res, 400, "最高管理员 admin 不可删除");
    return;
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  insertOperationLog({
    userId: admin.id,
    userName: admin.name,
    action: "user.delete_hard",
    targetType: "user",
    targetId: target.id,
    targetTitle: target.username,
    detail: "账号被完全删除",
  });
  broadcast("users-changed", { userId: target.id, deleted: true });
  broadcast("tasks-changed", { userId: target.id, reason: "user-hard-deleted" });
  sendJson(res, 200, { ok: true });
}

function publicPolicyUser(user) {
  const safeUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    customRoleName: user.customRoleName || "",
    departmentId: user.departmentId || "",
    customPermissions: user.customPermissions || "{}",
    disabledAt: user.disabledAt || "",
    deletedAt: user.deletedAt || "",
  };
  safeUser.effectivePermissions = safeUser.role === "custom" && !safeUser.departmentId ? [] : resolveUserPermissionCodes(safeUser);
  return safeUser;
}

function persistTaskResponsibilityChanges(tasks) {
  (tasks || []).forEach((task) => updateTask(task));
}

function normalizeManagedRole(value) {
  const role = String(value || "").trim();
  if (role === "owner") return "custom";
  return MANAGED_ROLES.has(role) ? role : "custom";
}

function normalizeCustomRoleName(role, value) {
  if (role !== "custom") return "";
  return String(value || "").trim().slice(0, 24);
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
  const extra = normalizePermissionCodes(value.extra);
  const disabled = normalizePermissionCodes(value.disabled).filter((code) => !extra.includes(code));
  return { extra, disabled };
}

function normalizePermissionCodes(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()))].filter(Boolean);
}

module.exports = {
  handlePolicyCreateUser,
  handlePolicyDeleteUser,
  handlePolicyUpdateUser,
  handlePolicyUsers,
};
