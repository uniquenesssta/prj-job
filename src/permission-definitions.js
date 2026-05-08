const BASIC_PERMISSIONS = [
  { code: "users.manage", name: "账号管理", group: "用户、部门、权限" },
  { code: "departments.manage", name: "部门管理", group: "用户、部门、权限" },
  { code: "permissions.manage", name: "权限设置", group: "用户、部门、权限" },
  { code: "tasks.read_all", name: "查看全部任务", group: "任务" },
  { code: "tasks.create_public", name: "创建公共任务", group: "任务" },
  { code: "tasks.create_private", name: "创建个人任务", group: "任务" },
  { code: "tasks.edit_brief", name: "修改任务信息（旧权限）", group: "任务" },
  { code: "tasks.update_status", name: "更新任务状态（旧权限）", group: "任务" },
  { code: "tasks.delete", name: "删除任务", group: "任务" },
  { code: "files.upload", name: "上传附件", group: "附件" },
  { code: "files.download", name: "下载附件", group: "附件" },
  { code: "files.delete_own", name: "删除自己上传的文件", group: "附件" },
  { code: "files.delete_any", name: "删除任意文件", group: "附件" },
  { code: "comments.write", name: "写公开留言", group: "留言" },
  { code: "notes.write", name: "写个人备注", group: "个人备注" },
  { code: "archives.manage", name: "归档和恢复任务", group: "归档" },
  { code: "system.maintain", name: "系统维护", group: "维护" },
  { code: "operation_logs.view", name: "查看操作记录", group: "操作记录" },
  { code: "operation_logs.export", name: "导出操作记录", group: "操作记录" },
  { code: "views.other_designers", name: "查看其他设计师", group: "视图权限" },
  { code: "views.other_services", name: "查看其他客服", group: "视图权限" },
];

const FLOW_PERMISSIONS = [
  { code: "tasks.flow.todo_to_doing", name: "待开始 → 进行中", group: "流程权限" },
  { code: "tasks.flow.doing_to_review", name: "进行中 → 待审核", group: "流程权限" },
  { code: "tasks.flow.review_to_done", name: "待审核 → 已完成", group: "流程权限" },
  { code: "tasks.flow.to_blocked", name: "标记为受阻", group: "流程权限" },
  { code: "tasks.flow.reopen", name: "重新打开任务", group: "流程权限" },
];

const FIELD_PERMISSIONS = [
  { code: "tasks.fields.title.edit", name: "编辑任务标题", group: "字段权限" },
  { code: "tasks.fields.description.edit", name: "编辑任务说明", group: "字段权限" },
  { code: "tasks.fields.wechat.edit", name: "编辑微信号", group: "字段权限" },
  { code: "tasks.fields.orderNo.edit", name: "编辑订单号", group: "字段权限" },
  { code: "tasks.fields.taobaoId.edit", name: "编辑淘宝ID", group: "字段权限" },
  { code: "tasks.fields.assigneeId.edit", name: "修改设计师", group: "字段权限" },
  { code: "tasks.fields.dueDate.edit", name: "修改截止日期", group: "字段权限" },
  { code: "tasks.fields.priority.edit", name: "修改优先级", group: "字段权限" },
  { code: "tasks.fields.taskType.edit", name: "编辑任务类型", group: "字段权限" },
  { code: "tasks.fields.sizeSpec.edit", name: "编辑尺寸规格", group: "字段权限" },
  { code: "tasks.fields.deliverFormat.edit", name: "编辑交付格式", group: "字段权限" },
  { code: "tasks.fields.customerRequirement.edit", name: "编辑客户原始需求", group: "字段权限" },
  { code: "tasks.fields.remark.edit", name: "编辑内部备注", group: "字段权限" },
];

const PERMISSION_DEFINITIONS = [...BASIC_PERMISSIONS, ...FLOW_PERMISSIONS, ...FIELD_PERMISSIONS];
const ALL_PERMISSION_CODES = PERMISSION_DEFINITIONS.map((item) => item.code);

const STATUS_FLOW_PERMISSION_MAP = {
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

const TASK_FIELD_PERMISSION_MAP = {
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

const ROLE_PERMISSION_CODES = {
  owner: ALL_PERMISSION_CODES,
  service: [
    "tasks.create_public",
    "tasks.edit_brief",
    "tasks.update_status",
    "tasks.flow.review_to_done",
    "tasks.flow.to_blocked",
    "tasks.flow.reopen",
    "tasks.fields.title.edit",
    "tasks.fields.description.edit",
    "tasks.fields.wechat.edit",
    "tasks.fields.orderNo.edit",
    "tasks.fields.taobaoId.edit",
    "tasks.fields.assigneeId.edit",
    "tasks.fields.dueDate.edit",
    "tasks.fields.priority.edit",
    "tasks.fields.taskType.edit",
    "tasks.fields.sizeSpec.edit",
    "tasks.fields.deliverFormat.edit",
    "tasks.fields.customerRequirement.edit",
    "tasks.fields.remark.edit",
    "files.upload",
    "files.download",
    "comments.write",
    "notes.write",
  ],
  designer: [
    "tasks.create_private",
    "tasks.update_status",
    "tasks.flow.todo_to_doing",
    "tasks.flow.doing_to_review",
    "tasks.flow.to_blocked",
    "tasks.flow.reopen",
    "tasks.fields.description.edit",
    "tasks.fields.taskType.edit",
    "tasks.fields.sizeSpec.edit",
    "tasks.fields.deliverFormat.edit",
    "tasks.fields.remark.edit",
    "files.upload",
    "files.download",
    "comments.write",
    "notes.write",
  ],
};

function statusTransitionPermissionCode(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return "";
  return STATUS_FLOW_PERMISSION_MAP[`${fromStatus}:${toStatus}`] || "tasks.flow.reopen";
}

function taskFieldPermissionCode(field) {
  return TASK_FIELD_PERMISSION_MAP[field] || "";
}

module.exports = {
  ALL_PERMISSION_CODES,
  FIELD_PERMISSIONS,
  FLOW_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_CODES,
  STATUS_FLOW_PERMISSION_MAP,
  TASK_FIELD_PERMISSION_MAP,
  statusTransitionPermissionCode,
  taskFieldPermissionCode,
};
