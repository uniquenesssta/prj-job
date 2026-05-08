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
  const departments = listDepartments().filter((department) => !department.deletedAt);
  const name = String(body.name || "").trim();
  const defaultRole = normalizeRole(body.defaultRole);
  const customRoleName = normalizeCustomRoleName(defaultRole, body.customRoleName);
  const parentId = normalizeParentId(body.parentId, departments);
  const managerId = normalizeManagerId(body.managerId);
  if (!name) {
    sendError(res, 400, "请填写部门名称");
    return;
  }
  if (defaultRole === "custom" && !customRoleName) {
    sendError(res, 400, "请选择自定义时，请填写自定义角色名称");
    return;
  }
  const now = new Date().toISOString();
  const department = {
    id: createId("dept"),
    name,
    description: String(body.description || "").trim(),
    defaultRole,
    customRoleName,
    permissionPreset: normalizePermissionPreset(body.permissionPreset),
    parentId,
    managerId,
    allowViewOwnDepartmentTasks: normalizeBoolean(body.allowViewOwnDepartmentTasks),
    allowViewChildDepartmentTasks: normalizeBoolean(body.allowViewChildDepartmentTasks),
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
    detail: JSON.stringify({ defaultRole, customRoleName, parentId, managerId }),
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
  const departments = listDepartments().filter((department) => !department.deletedAt);
  const current = departments.find((department) => department.id === departmentId);
  if (!current) {
    sendError(res, 404, "部门不存在");
    return;
  }
  const body = await readJson(req);
  const now = new Date().toISOString();
  const defaultRole = body.defaultRole !== undefined ? normalizeRole(body.defaultRole) : current.defaultRole;
  const customRoleName = body.customRoleName !== undefined
    ? normalizeCustomRoleName(defaultRole, body.customRoleName)
    : normalizeCustomRoleName(defaultRole, current.customRoleName);
  const parentId = body.parentId !== undefined ? normalizeParentId(body.parentId, departments, current.id) : current.parentId || "";
  if (parentId && createsDepartmentCycle(current.id, parentId, departments)) {
    sendError(res, 400, "不能把部门移动到自己的下级部门中");
    return;
  }
  const next = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() : current.name,
    description: body.description !== undefined ? String(body.description).trim() : current.description,
    defaultRole,
    customRoleName,
    permissionPreset: body.permissionPreset !== undefined ? normalizePermissionPreset(body.permissionPreset) : current.permissionPreset,
    parentId,
    managerId: body.managerId !== undefined ? normalizeManagerId(body.managerId) : current.managerId || "",
    allowViewOwnDepartmentTasks: body.allowViewOwnDepartmentTasks !== undefined ? normalizeBoolean(body.allowViewOwnDepartmentTasks) : Boolean(current.allowViewOwnDepartmentTasks),
    allowViewChildDepartmentTasks: body.allowViewChildDepartmentTasks !== undefined ? normalizeBoolean(body.allowViewChildDepartmentTasks) : Boolean(current.allowViewChildDepartmentTasks),
    disabledAt: body.disabled !== undefined ? (body.disabled === true || body.disabled === "true" ? current.disabledAt || now : "") : current.disabledAt,
    updatedAt: now,
  };
  if (!next.name) {
    sendError(res, 400, "部门名称不能为空");
    return;
  }
  if (next.defaultRole === "custom" && !next.customRoleName) {
    sendError(res, 400, "请选择自定义时，请填写自定义角色名称");
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
    detail: JSON.stringify({
      defaultRole: next.defaultRole,
      customRoleName: next.customRoleName,
      parentId: next.parentId,
      managerId: next.managerId,
      allowViewOwnDepartmentTasks: Boolean(next.allowViewOwnDepartmentTasks),
      allowViewChildDepartmentTasks: Boolean(next.allowViewChildDepartmentTasks),
    }),
  });
  sendJson(res, 200, { department: next });
}

function normalizeRole(value) {
  return ["owner", "service", "designer", "custom"].includes(value) ? value : "designer";
}

function normalizeCustomRoleName(defaultRole, value) {
  if (defaultRole !== "custom") return "";
  return String(value || "").trim().slice(0, 24);
}

function normalizeParentId(value, departments, currentId = "") {
  const parentId = String(value || "").trim();
  if (!parentId || parentId === currentId) return "";
  return departments.some((department) => department.id === parentId) ? parentId : "";
}

function normalizeManagerId(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function createsDepartmentCycle(currentId, parentId, departments) {
  let cursor = parentId;
  const visited = new Set();
  while (cursor) {
    if (cursor === currentId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const parent = departments.find((department) => department.id === cursor);
    cursor = parent?.parentId || "";
  }
  return false;
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
