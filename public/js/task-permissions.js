const taskFieldPermissionMap = {
  title: "tasks.fields.title.edit",
  description: "tasks.fields.description.edit",
  wechat: "tasks.fields.wechat.edit",
  orderNo: "tasks.fields.orderNo.edit",
  taobaoId: "tasks.fields.taobaoId.edit",
  assigneeId: "tasks.fields.assigneeId.edit",
  dueDate: "tasks.fields.dueDate.edit",
  priority: "tasks.fields.priority.edit",
  taskType: "tasks.fields.taskType.edit",
  sizeSpec: "tasks.fields.sizeSpec.edit",
  deliverFormat: "tasks.fields.deliverFormat.edit",
  customerRequirement: "tasks.fields.customerRequirement.edit",
  remark: "tasks.fields.remark.edit",
};

const statusFlowPermissionMap = {
  "todo:doing": "tasks.flow.todo_to_doing",
  "doing:review": "tasks.flow.doing_to_review",
  "review:done": "tasks.flow.review_to_done",
  "todo:blocked": "tasks.flow.to_blocked",
  "doing:blocked": "tasks.flow.to_blocked",
  "review:blocked": "tasks.flow.to_blocked",
  "blocked:todo": "tasks.flow.reopen",
  "blocked:doing": "tasks.flow.reopen",
  "review:doing": "tasks.flow.reopen",
  "done:review": "tasks.flow.reopen",
  "done:doing": "tasks.flow.reopen",
  "done:todo": "tasks.flow.reopen",
};

function taskFieldPermissionCode(field) {
  return taskFieldPermissionMap[field] || "";
}

function statusTransitionPermissionCode(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return "";
  return statusFlowPermissionMap[`${fromStatus}:${toStatus}`] || "tasks.flow.reopen";
}

function canEditTaskField(task, field) {
  if (task.visibility === "private" && task.creatorId === state.user.id && task.assigneeId === state.user.id) return true;
  const code = taskFieldPermissionCode(field);
  return Boolean(code) && userHasPermission(code) && canOperateTask(task);
}

function canEditBrief(task) {
  return Object.keys(taskFieldPermissionMap).some((field) => canEditTaskField(task, field));
}

function canChangeTaskStatus(task, nextStatus) {
  if (!task || !nextStatus) return false;
  if (nextStatus === task.status) return canUpdateTaskStatus(task);
  const code = statusTransitionPermissionCode(task.status, nextStatus);
  return Boolean(code) && userHasPermission(code) && canOperateTask(task);
}

function allowedStatusOptions(task) {
  return Object.keys(statusLabels).filter((status) => status === task.status || canChangeTaskStatus(task, status));
}
