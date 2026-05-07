const { listDepartments } = require("./repositories/departments-repo");

const ROLE_PERMISSIONS = {
  owner: [
    "users.manage",
    "departments.manage",
    "permissions.manage",
    "tasks.read_all",
    "tasks.create_public",
    "tasks.create_private",
    "tasks.edit_brief",
    "tasks.update_status",
    "tasks.delete",
    "files.upload",
    "files.download",
    "files.delete_own",
    "files.delete_any",
    "comments.write",
    "notes.write",
    "archives.manage",
    "system.maintain",
    "operation_logs.view",
    "operation_logs.export",
    "views.other_designers",
    "views.other_services",
  ],
  service: ["tasks.create_public", "tasks.edit_brief", "files.upload", "files.download", "comments.write", "notes.write"],
  designer: ["tasks.create_private", "tasks.update_status", "files.upload", "files.download", "comments.write", "notes.write"],
};

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

function canUpdateTaskStatus(user, task) {
  if (!user || !task) return false;
  return hasPermission(user, "tasks.update_status") && canOperateTask(user, task);
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

module.exports = {
  canAccessTask,
  canArchiveTask,
  canCommentTask,
  canCreatePersonalTask,
  canCreatePublicTask,
  canDeleteTask,
  canDeleteUploadedFile,
  canDownloadTaskFile,
  canEditTaskBrief,
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
  hasAnyPermission,
  hasPermission,
  parsePermissionObject,
  resolveUserPermissionCodes,
  rolePermissionCodes,
};
