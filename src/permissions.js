function isOwner(user) {
  return user?.role === "owner";
}

function isService(user) {
  return user?.role === "service";
}

function isDesigner(user) {
  return user?.role === "designer";
}

function canAccessTask(user, task) {
  if (!user || !task) return false;
  if (isOwner(user)) return true;
  if (task.visibility === "private") {
    return task.creatorId === user.id && task.assigneeId === user.id;
  }
  if (isService(user)) return task.creatorId === user.id;
  if (isDesigner(user)) return task.assigneeId === user.id;
  return false;
}

function canCreatePublicTask(user) {
  return isOwner(user) || isService(user);
}

function canCreatePersonalTask(user) {
  return isDesigner(user);
}

function canEditTaskBrief(user, task) {
  if (!user || !task) return false;
  if (isOwner(user)) return true;
  if (isService(user)) return task.visibility !== "private" && task.creatorId === user.id;
  return isDesigner(user) && task.visibility === "private" && task.creatorId === user.id && task.assigneeId === user.id;
}

function canUpdateTaskStatus(user, task) {
  if (!user || !task) return false;
  if (isOwner(user)) return true;
  if (isService(user)) return task.visibility !== "private" && task.creatorId === user.id;
  return isDesigner(user) && task.assigneeId === user.id;
}

function canUploadToTask(user, task) {
  return canAccessTask(user, task);
}

function canDownloadTaskFile(user, task, file) {
  return Boolean(file && task && file.taskId === task.id && canAccessTask(user, task));
}

function canCommentTask(user, task) {
  return canAccessTask(user, task) && task.visibility !== "private";
}

function canWritePersonalNote(user, task) {
  if (!user || !task) return false;
  return isDesigner(user) && task.visibility === "private" && task.creatorId === user.id && task.assigneeId === user.id;
}

function canManageUsers(user) {
  return isOwner(user);
}

function canArchiveTask(user, task) {
  return isOwner(user) && task?.status === "done" && !task.archivedAt;
}

function canRestoreTask(user, task) {
  return isOwner(user) && Boolean(task);
}

module.exports = {
  canAccessTask,
  canArchiveTask,
  canCommentTask,
  canCreatePersonalTask,
  canCreatePublicTask,
  canDownloadTaskFile,
  canEditTaskBrief,
  canManageUsers,
  canRestoreTask,
  canUpdateTaskStatus,
  canUploadToTask,
  canWritePersonalNote,
};
