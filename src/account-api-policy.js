const { readJson, sendError } = require("./http-utils");
const { requireUser } = require("./auth");
const { canManageUsers } = require("./permissions");
const { readDb } = require("./storage");

const ACCOUNT_ROLES = new Set(["designer", "service", "custom"]);

async function enforceCreateAccountPolicy(req, res) {
  const manager = requireUser(req, res);
  if (!manager) return false;
  if (!canManageUsers(manager)) {
    sendError(res, 403, "只有管理员可以新增账号");
    return false;
  }
  const body = await readJson(req);
  const role = normalizeRole(body.role);
  body.role = role;
  body.customRoleName = normalizeCustomRoleName(role, body.customRoleName);
  body.departmentId = String(body.departmentId || "").trim();
  if (role === "custom" && !body.customRoleName) {
    sendError(res, 400, "自定义角色需要填写角色名称");
    return false;
  }
  if (body.role === "owner") {
    sendError(res, 400, "不能新增管理员账号");
    return false;
  }
  req.__jsonBody = body;
  return true;
}

async function enforceUpdateAccountPolicy(req, res, userId) {
  const manager = requireUser(req, res);
  if (!manager) return false;
  if (!canManageUsers(manager)) {
    sendError(res, 403, "只有管理员可以修改账号");
    return false;
  }
  const body = await readJson(req);
  const target = readDb().users.find((user) => user.id === userId);
  if (!target) return true;
  if (target.role === "owner") {
    const password = String(body.password || "").trim();
    req.__jsonBody = password ? { password } : {};
    return true;
  }
  if (body.role !== undefined) body.role = normalizeRole(body.role);
  if (body.role === "owner") {
    sendError(res, 400, "普通账号不能改为管理员");
    return false;
  }
  const role = body.role || target.role;
  if (body.customRoleName !== undefined) body.customRoleName = normalizeCustomRoleName(role, body.customRoleName);
  if (role === "custom" && !String(body.customRoleName || target.customRoleName || "").trim()) {
    sendError(res, 400, "自定义角色需要填写角色名称");
    return false;
  }
  if (body.departmentId !== undefined) body.departmentId = String(body.departmentId || "").trim();
  req.__jsonBody = body;
  return true;
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
};
