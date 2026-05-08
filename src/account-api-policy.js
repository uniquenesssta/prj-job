const { readJson, sendError, sendJson } = require("./http-utils");
const { requireUser } = require("./auth");
const { canManageUsers, hasAnyPermission, hasPermission, resolveUserPermissionCodes } = require("./permissions");
const { getDatabase } = require("./database");
const { readDb } = require("./storage");

const ACCOUNT_ROLES = new Set(["designer", "service", "custom"]);

function ensureAccountRoleSchema() {
  const db = getDatabase();
  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("customRoleName")) db.exec("ALTER TABLE users ADD COLUMN customRoleName TEXT NOT NULL DEFAULT ''");
}

function handlePolicyUsers(req, res) {
  const user = requireUser(req, res);
  if (!user) return true;
  ensureAccountRoleSchema();
  const allUsers = readDb().users;
  const canViewAllUsers = hasAnyPermission(user, ["users.manage", "tasks.read_all"]);
  const visibleUsers = allUsers.filter((item) => {
    if (item.deletedAt) return false;
    if (canViewAllUsers || item.id === user.id) return true;
    if (item.role === "designer" && hasPermission(user, "views.other_designers")) return true;
    if (item.role === "service" && hasPermission(user, "views.other_services")) return true;
    if (user.role === "service" && item.role === "designer") return true;
    return false;
  });
  sendJson(res, 200, { users: visibleUsers.map(publicPolicyUser) });
  return true;
}

async function enforceCreateAccountPolicy(req, res) {
  const manager = requireUser(req, res);
  if (!manager) return false;
  if (!canManageUsers(manager)) {
    sendError(res, 403, "只有管理员可以新增账号");
    return false;
  }
  ensureAccountRoleSchema();
  const body = await readJson(req);
  const requestedRole = normalizeRole(body.role);
  const customRoleName = normalizeCustomRoleName(requestedRole, body.customRoleName);
  if (requestedRole === "custom" && !customRoleName) {
    sendError(res, 400, "自定义角色需要填写角色名称");
    return false;
  }
  body.role = requestedRole === "custom" ? "designer" : requestedRole;
  body.departmentId = String(body.departmentId || "").trim();
  req.__jsonBody = body;
  req.__accountPolicyPost = () => persistCreatedAccountRole(body.username, requestedRole, customRoleName, body.departmentId);
  return true;
}

async function enforceUpdateAccountPolicy(req, res, userId) {
  const manager = requireUser(req, res);
  if (!manager) return false;
  if (!canManageUsers(manager)) {
    sendError(res, 403, "只有管理员可以修改账号");
    return false;
  }
  ensureAccountRoleSchema();
  const body = await readJson(req);
  const target = readDb().users.find((user) => user.id === userId);
  if (!target) return true;
  if (target.role === "owner") {
    req.__jsonBody = body.password ? { password: body.password } : {};
    return true;
  }
  let requestedRole = body.role !== undefined ? normalizeRole(body.role) : target.role;
  const customRoleName = body.customRoleName !== undefined
    ? normalizeCustomRoleName(requestedRole, body.customRoleName)
    : normalizeCustomRoleName(requestedRole, target.customRoleName);
  if (requestedRole === "custom" && !customRoleName) {
    sendError(res, 400, "自定义角色需要填写角色名称");
    return false;
  }
  body.role = requestedRole === "custom" ? (target.role === "service" ? "service" : "designer") : requestedRole;
  if (body.departmentId !== undefined) body.departmentId = String(body.departmentId || "").trim();
  req.__jsonBody = body;
  req.__accountPolicyPost = () => persistUpdatedAccountRole(userId, requestedRole, customRoleName, body.departmentId);
  return true;
}

function persistCreatedAccountRole(username, role, customRoleName, departmentId) {
  const db = getDatabase();
  const target = db.prepare("SELECT id FROM users WHERE username = ?").get(String(username || "").trim());
  if (!target) return;
  persistUpdatedAccountRole(target.id, role, customRoleName, departmentId);
}

function persistUpdatedAccountRole(userId, role, customRoleName, departmentId) {
  const db = getDatabase();
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
  if (!target || target.role === "owner") return;
  if (departmentId !== undefined) {
    db.prepare("UPDATE users SET role = ?, customRoleName = ?, departmentId = ? WHERE id = ?").run(role, customRoleName || "", String(departmentId || "").trim(), userId);
  } else {
    db.prepare("UPDATE users SET role = ?, customRoleName = ? WHERE id = ?").run(role, customRoleName || "", userId);
  }
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
  safeUser.effectivePermissions = resolveUserPermissionCodes(safeUser);
  return safeUser;
}

function normalizeRole(value) {
  const role = String(value || "").trim();
  return ACCOUNT_ROLES.has(role) ? role : "custom";
}

function normalizeCustomRoleName(role, value) {
  if (role !== "custom") return "";
  return String(value || "").trim().slice(0, 24);
}

module.exports = {
  enforceCreateAccountPolicy,
  enforceUpdateAccountPolicy,
  handlePolicyUsers,
};
