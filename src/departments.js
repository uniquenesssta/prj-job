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
  const parentDepartmentIds = normalizeParentDepartmentIds(body.parentDepartmentIds ?? body.parentId, departments);
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
    parentId: parentDepartmentIds[0] || "",
    parentDepartmentIds: JSON.stringify(parentDepartmentIds),
    managerId,
    allowViewOwnDepartmentTasks: normalizeBoolean(body.allowViewOwnDepartmentTasks),
    allowViewChildDepartmentTasks: normalizeBoolean(body.allowViewChildDepartmentTasks),
    childDepartmentScope: normalizeChildDepartmentScope(body.childDepartmentScope, departments),
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
    detail: JSON.stringify({ defaultRole, customRoleName, parentDepartmentIds, managerId, childDepartmentScope: department.childDepartmentScope }),
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
  const parentDepartmentIds = body.parentDepartmentIds !== undefined || body.parentId !== undefined
    ? normalizeParentDepartmentIds(body.parentDepartmentIds ?? body.parentId, departments, current.id)
    : normalizeParentDepartmentIds(current.parentDepartmentIds || current.parentId, departments, current.id);
  if (parentDepartmentIds.some((parentId) => createsDepartmentCycle(current.id, parentId, departments))) {
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
    parentId: parentDepartmentIds[0] || "",
    parentDepartmentIds: JSON.stringify(parentDepartmentIds),
    managerId: body.managerId !== undefined ? normalizeManagerId(body.managerId) : current.managerId || "",
    allowViewOwnDepartmentTasks: body.allowViewOwnDepartmentTasks !== undefined ? normalizeBoolean(body.allowViewOwnDepartmentTasks) : Boolean(current.allowViewOwnDepartmentTasks),
    allowViewChildDepartmentTasks: body.allowViewChildDepartmentTasks !== undefined ? normalizeBoolean(body.allowViewChildDepartmentTasks) : Boolean(current.allowViewChildDepartmentTasks),
    childDepartmentScope: body.childDepartmentScope !== undefined ? normalizeChildDepartmentScope(body.childDepartmentScope, departments, current.id) : current.childDepartmentScope || "[]",
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
  if (body.directChildDepartmentIds !== undefined) {
    applyDirectChildDepartments(next.id, body.directChildDepartmentIds, departments, now);
  }
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
      parentDepartmentIds,
      managerId: next.managerId,
      allowViewOwnDepartmentTasks: Boolean(next.allowViewOwnDepartmentTasks),
      allowViewChildDepartmentTasks: Boolean(next.allowViewChildDepartmentTasks),
      childDepartmentScope: next.childDepartmentScope,
      directChildDepartmentIds: normalizeDepartmentIdArray(body.directChildDepartmentIds, departments, next.id),
    }),
  });
  sendJson(res, 200, { department: next });
}

function applyDirectChildDepartments(parentId, value, departments, now) {
  const selectedIds = new Set(normalizeDepartmentIdArray(value, departments, parentId));
  departments.forEach((department) => {
    if (department.id === parentId) return;
    const currentParents = normalizeParentDepartmentIds(department.parentDepartmentIds || department.parentId, departments, department.id);
    const shouldBeChild = selectedIds.has(department.id);
    const isDirectChild = currentParents.includes(parentId);
    if (!shouldBeChild && !isDirectChild) return;
    if (shouldBeChild && createsDepartmentCycle(parentId, department.id, departments)) return;
    const nextParents = new Set(currentParents);
    if (shouldBeChild) nextParents.add(parentId);
    else nextParents.delete(parentId);
    const nextParentIds = [...nextParents];
    updateDepartment({
      ...department,
      parentId: nextParentIds[0] || "",
      parentDepartmentIds: JSON.stringify(nextParentIds),
      updatedAt: now,
    });
  });
}

function normalizeRole(value) {
  return ["owner", "service", "designer", "custom"].includes(value) ? value : "designer";
}

function normalizeCustomRoleName(defaultRole, value) {
  if (defaultRole !== "custom") return "";
  return String(value || "").trim().slice(0, 24);
}

function normalizeParentDepartmentIds(value, departments, currentId = "") {
  const ids = normalizeDepartmentIdArray(value, departments, currentId);
  return ids.filter((id) => !createsDepartmentCycle(currentId, id, departments));
}

function normalizeManagerId(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function normalizeChildDepartmentScope(value, departments, currentId = "") {
  return JSON.stringify(normalizeDepartmentIdArray(value, departments, currentId));
}

function normalizeDepartmentIdArray(value, departments, currentId = "") {
  let ids = [];
  if (Array.isArray(value)) ids = value;
  else if (typeof value === "string") {
    try {
      ids = JSON.parse(value || "[]");
    } catch {
      ids = value.split(",");
    }
  }
  const allowed = new Set(departments.filter((department) => department.id !== currentId).map((department) => department.id));
  return [...new Set(ids.map((id) => String(id).trim()).filter((id) => allowed.has(id)))];
}

function createsDepartmentCycle(currentId, parentId, departments) {
  if (!currentId || !parentId) return false;
  let cursors = [parentId];
  const visited = new Set();
  while (cursors.length) {
    const cursor = cursors.shift();
    if (cursor === currentId) return true;
    if (visited.has(cursor)) continue;
    visited.add(cursor);
    const parent = departments.find((department) => department.id === cursor);
    cursors.push(...normalizeDepartmentIdArray(parent?.parentDepartmentIds || parent?.parentId || "[]", departments, parent?.id || ""));
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
