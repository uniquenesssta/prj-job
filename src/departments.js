const { readJson, sendError, sendJson } = require("./http-utils");
const { requireUser } = require("./auth");
const { canManageDepartments } = require("./permissions");
const { createId } = require("./storage");
const {
  createDepartment,
  listDepartments,
  updateDepartment,
} = require("./repositories/departments-repo");
const { insertOperationLog } = require("./repositories/system-repo");

function handleGetDepartments(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { departments: listDepartments().filter((department) => !department.deletedAt) });
}

async function handleCreateDepartment(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!canManageDepartments(user)) {
    sendError(res, 403, "只有管理员可以新增部门");
    return;
  }
  const body = await readJson(req);
  const name = String(body.name || "").trim();
  if (!name) {
    sendError(res, 400, "请填写部门名称");
    return;
  }
  const now = new Date().toISOString();
  const department = {
    id: createId("dept"),
    name,
    description: String(body.description || "").trim(),
    defaultRole: normalizeRole(body.defaultRole),
    permissionPreset: normalizePermissionPreset(body.permissionPreset),
    disabledAt: body.disabled === true || body.disabled === "true" ? now : "",
    deletedAt: "",
    createdAt: now,
    updatedAt: now,
  };
  createDepartment(department);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: "department.create",
    targetType: "department",
    targetId: department.id,
    targetTitle: department.name,
  });
  sendJson(res, 201, { department });
}

async function handleUpdateDepartment(req, res, departmentId) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!canManageDepartments(user)) {
    sendError(res, 403, "只有管理员可以修改部门");
    return;
  }
  const current = listDepartments().find((department) => department.id === departmentId && !department.deletedAt);
  if (!current) {
    sendError(res, 404, "部门不存在");
    return;
  }
  const body = await readJson(req);
  const now = new Date().toISOString();
  const next = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() : current.name,
    description: body.description !== undefined ? String(body.description).trim() : current.description,
    defaultRole: body.defaultRole !== undefined ? normalizeRole(body.defaultRole) : current.defaultRole,
    permissionPreset: body.permissionPreset !== undefined ? normalizePermissionPreset(body.permissionPreset) : current.permissionPreset,
    disabledAt: body.disabled !== undefined ? (body.disabled === true || body.disabled === "true" ? current.disabledAt || now : "") : current.disabledAt,
    updatedAt: now,
  };
  if (!next.name) {
    sendError(res, 400, "部门名称不能为空");
    return;
  }
  updateDepartment(next);
  insertOperationLog({
    userId: user.id,
    userName: user.name,
    action: next.disabledAt && !current.disabledAt ? "department.disable" : "department.update",
    targetType: "department",
    targetId: next.id,
    targetTitle: next.name,
  });
  sendJson(res, 200, { department: next });
}

function normalizeRole(value) {
  return ["owner", "service", "designer", "custom"].includes(value) ? value : "designer";
}

function normalizePermissionPreset(value) {
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
  handleCreateDepartment,
  handleGetDepartments,
  handleUpdateDepartment,
};
