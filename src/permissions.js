const { listDepartments } = require("./repositories/departments-repo");
const { listUsers } = require("./repositories/users-repo");
const {
  ROLE_PERMISSION_CODES,
  statusTransitionPermissionCode,
  taskFieldPermissionCode,
} = require("./permission-definitions");

const ROLE_PERMISSIONS = ROLE_PERMISSION_CODES;

function isOwner(user) {
  return user?.role === "owner";
}

function canAccessTask(user, task) {
  if (!user || !task) return false;
  if (hasPermission(user, "tasks.read_all")) return true;
  if (task.visibility === "private") {
    return task.creatorId === user.id && task.assigneeId === user.id;
  }
  if (task.creatorId === user.id || task.assigneeId === user.id) return true;
  if (canAccessDepartmentTask(user, task)) return true;
  if (hasPermission(user, "views.other_designers") && task.assigneeId) return true;
  if (hasPermission(user, "views.other_services") && task.creatorId) return true;
  return false;
}

function canOperateTask(user, task) {
  if (!user || !task) return false;
  if (hasPermission(user, "tasks.read_all")) return true;
  return task.creatorId === user.id || task.assigneeId === user.id;
}

function canCreatePublicTask(user) {
  return hasPermission(user, "tasks.create_public");
}

function canCreatePersonalTask(user) {
  return hasPermission(user, "tasks.create_private");
}

function canEditTaskBrief(user, task) {
  if (!user || !task) return false;
  if (task.visibility === "private" && task.creatorId === user.id && task.assigneeId === user.id) return true;
  return hasPermission(user, "tasks.edit_brief") && canOperateTask(user, task);
}

function canEditTaskField(user, task, field) {
  if (!user || !task || !field) return false;
  if (task.visibility === "private" && task.creatorId === user.id && task.assigneeId === user.id) return true;
  const permissionCode = taskFieldPermissionCode(field);
  return Boolean(permissionCode) && hasPermission(user, permissionCode) && canOperateTask(user, task);
}

function editableTaskFields(user, task) {
  const fields = [
    "title",
    "description",
    "wechat",
    "orderNo",
    "taobaoId",
    "assigneeId",
    "dueDate",
    "priority",
    "taskType",
    "sizeSpec",
    "deliverFormat",
    "customerRequirement",
    "remark",
  ];
  return fields.filter((field) => canEditTaskField(user, task, field));
}

function canUpdateTaskStatus(user, task) {
  if (!user || !task) return false;
  return hasPermission(user, "tasks.update_status") && canOperateTask(user, task);
}

function canChangeTaskStatus(user, task, nextStatus) {
  if (!user || !task || !nextStatus) return false;
  if (task.status === nextStatus) return canUpdateTaskStatus(user, task);
  const permissionCode = statusTransitionPermissionCode(task.status, nextStatus);
  return Boolean(permissionCode) && hasPermission(user, permissionCode) && canOperateTask(user, task);
}

function allowedTaskStatuses(user, task) {
  const statuses = ["todo", "doing", "review", "done", "blocked"];
  if (!user || !task) return [];
  return statuses.filter((status) => status === task.status || canChangeTaskStatus(user, task, status));
}

function canUploadToTask(user, task) {
  return hasPermission(user, "files.upload") && canOperateTask(user, task);
}

function canDownloadTaskFile(user, task, file) {
  return Boolean(file && task && file.taskId === task.id && hasPermission(user, "files.download") && canOperateTask(user, task));
}

function canDeleteUploadedFile(user, file) {
  if (!user || !file) return false;
  return hasPermission(user, "files.delete_any") || (hasPermission(user, "files.delete_own") && file.uploadedBy === user.id);
}

function canCommentTask(user, task) {
  return hasPermission(user, "comments.write") && canOperateTask(user, task) && task.visibility !== "private";
}

function canReadPersonalNote(user, task, note) {
  if (!user || !task || !note) return false;
  return canOperateTask(user, task) && note.userId === user.id;
}

function canWritePersonalNote(user, task) {
  return hasPermission(user, "notes.write") && canOperateTask(user, task);
}

function canWritePersonalRemark(user, task) {
  if (!user || !task) return false;
  return hasPermission(user, "notes.write") && task.visibility === "private" && task.creatorId === user.id && task.assigneeId === user.id;
}

function canManageUsers(user) {
  return hasPermission(user, "users.manage");
}

function canManageDepartments(user) {
  return hasPermission(user, "departments.manage");
}

function canManagePermissions(user) {
  return hasPermission(user, "permissions.manage");
}

function canArchiveTask(user, task) {
  return hasPermission(user, "archives.manage") && task?.status === "done" && !task.archivedAt;
}

function canRestoreTask(user, task) {
  return hasPermission(user, "archives.manage") && Boolean(task);
}

function canDeleteTask(user, task) {
  return hasPermission(user, "tasks.delete") && Boolean(task) && !task.deletedAt;
}

function canRunMaintenance(user) {
  return hasPermission(user, "system.maintain");
}

function canViewOperationLogs(user) {
  return hasPermission(user, "operation_logs.view");
}

function canViewOtherDesigners(user) {
  return hasPermission(user, "views.other_designers");
}

function canViewOtherServices(user) {
  return hasPermission(user, "views.other_services");
}

function canAccessDepartmentTask(user, task) {
  if (!user?.departmentId || !task || task.visibility === "private") return false;
  const departments = safeListDepartments();
  const ownDepartment = departments.find((department) => department.id === user.departmentId && !department.deletedAt && !department.disabledAt);
  if (!ownDepartment) return false;
  const isDepartmentManager = ownDepartment.managerId === user.id;
  if (!isDepartmentManager && !departmentFlag(ownDepartment.allowViewOwnDepartmentTasks) && !departmentFlag(ownDepartment.allowViewChildDepartmentTasks)) return false;

  const users = safeListUsers();
  const assignee = users.find((item) => item.id === task.assigneeId && !item.deletedAt);
  const creator = users.find((item) => item.id === task.creatorId && !item.deletedAt);
  const taskDepartmentIds = new Set([assignee?.departmentId, creator?.departmentId].filter(Boolean));
  if (!taskDepartmentIds.size) return false;

  if (departmentFlag(ownDepartment.allowViewOwnDepartmentTasks) || isDepartmentManager) {
    if (taskDepartmentIds.has(ownDepartment.id)) return true;
  }
  if (departmentFlag(ownDepartment.allowViewChildDepartmentTasks)) {
    const childIds = visibleChildDepartmentIds(ownDepartment, departments);
    return [...taskDepartmentIds].some((departmentId) => childIds.has(departmentId));
  }
  return false;
}

function visibleChildDepartmentIds(department, departments) {
  const allChildIds = childDepartmentIds(department.id, departments);
  const selectedScope = parseChildDepartmentScope(department.childDepartmentScope).filter((id) => allChildIds.has(id));
  if (!selectedScope.length) return allChildIds;
  const result = new Set();
  selectedScope.forEach((id) => {
    result.add(id);
    childDepartmentIds(id, departments).forEach((childId) => result.add(childId));
  });
  return result;
}

function parseChildDepartmentScope(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function childDepartmentIds(parentId, departments) {
  const result = new Set();
  const visit = (id) => {
    departments.filter((department) => department.parentId === id && !department.deletedAt && !department.disabledAt).forEach((department) => {
      if (result.has(department.id)) return;
      result.add(department.id);
      visit(department.id);
    });
  };
  visit(parentId);
  return result;
}

function departmentFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parsePermissionObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : value || {};
    return {
      extra: Array.isArray(parsed.extra) ? parsed.extra.map(String) : [],
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled.map(String) : [],
    };
  } catch {
    return { extra: [], disabled: [] };
  }
}

function rolePermissionCodes(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function resolveUserPermissionCodes(user, departments = null) {
  if (!user) return [];
  const departmentList = departments || safeListDepartments();
  const department = departmentList.find((item) => item.id === user.departmentId && !item.deletedAt);
  const preset = parsePermissionObject(department?.permissionPreset);
  const custom = parsePermissionObject(user.customPermissions);
  const permissions = new Set([...rolePermissionCodes(user.role), ...preset.extra, ...custom.extra]);
  [...preset.disabled, ...custom.disabled].forEach((code) => permissions.delete(code));
  return [...permissions].sort();
}

function hasPermission(user, code) {
  if (!user || !code) return false;
  if (Array.isArray(user.effectivePermissions)) return user.effectivePermissions.includes(code);
  return resolveUserPermissionCodes(user).includes(code);
}

function hasAnyPermission(user, codes) {
  return (codes || []).some((code) => hasPermission(user, code));
}

function safeListDepartments() {
  try {
    return listDepartments();
  } catch {
    return [];
  }
}

function safeListUsers() {
  try {
    return listUsers();
  } catch {
    return [];
  }
}

module.exports = {
  allowedTaskStatuses,
  canAccessTask,
  canArchiveTask,
  canChangeTaskStatus,
  canCommentTask,
  canCreatePersonalTask,
  canCreatePublicTask,
  canDeleteTask,
  canDeleteUploadedFile,
  canDownloadTaskFile,
  canEditTaskBrief,
  canEditTaskField,
  canManageDepartments,
  canManagePermissions,
  canManageUsers,
  canOperateTask,
  canReadPersonalNote,
  canRestoreTask,
  canRunMaintenance,
  canUpdateTaskStatus,
  canViewOtherDesigners,
  canViewOtherServices,
  canViewOperationLogs,
  canUploadToTask,
  canWritePersonalNote,
  canWritePersonalRemark,
  editableTaskFields,
  hasAnyPermission,
  hasPermission,
  isOwner,
  parsePermissionObject,
  resolveUserPermissionCodes,
  rolePermissionCodes,
};
