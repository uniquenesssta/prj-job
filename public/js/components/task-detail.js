function renderDetail() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task) return '<div class="empty">选择一个任务查看详情</div>';
  const isPersonalDesignerTask = state.user.role === "designer" && task.visibility === "private";
  return `
    <div class="detail-stack">
      <section class="detail-card detail-hero">
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">Task Detail</p>
            <h2>${escapeHtml(task.title)}</h2>
          </div>
          <span class="pill ${task.priority}">${priorityLabels[task.priority]}</span>
        </div>
        <p class="detail-desc">${escapeHtml(task.description || "暂无说明")}</p>
        ${renderArchiveControls(task)}
      </section>
      <div class="detail-layout ${isPersonalDesignerTask ? "solo-detail" : ""}">
        <section class="detail-card detail-main">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">Order Info</p>
              <h2>任务信息</h2>
            </div>
          </div>
          ${renderInlineInfo(task)}
        </section>
        ${isPersonalDesignerTask ? "" : renderPublicComments(task)}
      </div>
      ${renderUploadForm()}
      ${renderFiles(task)}
      ${isPersonalDesignerTask ? renderPersonalRemark(task) : ""}
    </div>
  `;
}

function renderTaskDetailModal() {
  if (!state.taskDetailModalOpen || !state.selectedTaskId) return "";
  return `
    <div class="modal-backdrop" id="taskDetailBackdrop">
      <section class="modal-card task-detail-modal-card">
        <div class="modal-topline">
          <span>任务详情</span>
          <button class="icon-button" id="closeTaskDetailModal" type="button">×</button>
        </div>
        ${renderDetail()}
      </section>
    </div>
  `;
}

function renderArchiveControls(task) {
  if (!userHasAnyPermission(["archives.manage", "tasks.delete"])) return "";
  const deleteButton = !task.archivedAt && userHasPermission("tasks.delete") ? '<button class="button danger" id="deleteTaskButton" type="button">删除任务</button>' : "";
  if (task.archivedAt) {
    if (!userHasPermission("archives.manage")) return "";
    return `
      <div class="archive-actions">
        <span>已归档：${formatDateTime(task.archivedAt)}</span>
        <button class="button secondary" id="restoreTaskButton" type="button">恢复显示</button>
      </div>
    `;
  }
  if (task.status === "done") {
    if (!userHasPermission("archives.manage")) return deleteButton ? `<div class="archive-actions">${deleteButton}</div>` : "";
    return `
      <div class="archive-actions">
        <span>已完成，可单独归档</span>
        <button class="button" id="archiveTaskButton" type="button">归档此任务</button>
      </div>
    `;
  }
  return deleteButton ? `<div class="archive-actions">${deleteButton}</div>` : "";
}

function statusOptions(currentStatus, allowedStatuses = null) {
  const statuses = Array.isArray(allowedStatuses) && allowedStatuses.length ? allowedStatuses : Object.keys(statusLabels);
  return statuses.map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${statusLabels[status]}</option>`).join("");
}

function taskTypeOptions(currentType) {
  const options = ["", "海报", "详情页", "KT板", "易拉宝", "主图", "头像/LOGO", "包装", "其他"];
  return options.map((item) => `<option value="${escapeAttr(item)}" ${item === currentType ? "selected" : ""}>${item || "未选择"}</option>`).join("");
}

function deliverFormatOptions(currentFormat) {
  const options = ["", "JPG", "PNG", "PSD", "AI", "PDF", "其他"];
  return options.map((item) => `<option value="${escapeAttr(item)}" ${item === currentFormat ? "selected" : ""}>${item || "未选择"}</option>`).join("");
}

function renderInlineInfo(task) {
  const editable = canEditBrief(task);
  const allowedStatuses = allowedStatusOptions(task);
  const statusEditable = allowedStatuses.some((status) => status !== task.status);
  const designers = task.visibility === "private" && state.user.role !== "owner"
    ? state.users.filter((user) => user.id === state.user.id)
    : state.users.filter((user) => user.role === "designer");
  const readonly = (label, value) => `<div class="info-tile"><span>${label}</span><strong>${escapeHtml(value || "未填写")}</strong></div>`;
  const inputTile = (field, label, value) => canEditTaskField(task, field)
    ? `<label class="info-tile"><span>${label}</span><input name="${field}" value="${escapeAttr(value || "")}" /></label>`
    : readonly(label, value);
  const selectTile = (field, label, value, optionsHtml) => canEditTaskField(task, field)
    ? `<label class="info-tile"><span>${label}</span><select name="${field}">${optionsHtml}</select></label>`
    : readonly(label, value);
  const textareaBlock = (field, label, value, className, rows = 3) => canEditTaskField(task, field)
    ? `<label class="${className}"><span>${label}</span><textarea name="${field}" rows="${rows}">${escapeHtml(value || "")}</textarea></label>`
    : `<div class="requirement-tile"><span>${label}</span><p>${escapeHtml(value || "未填写")}</p></div>`;
  const statusTile = statusEditable
    ? `<label class="info-tile status-cell"><span>状态</span><select name="status">${statusOptions(task.status, allowedStatuses)}</select></label>`
    : readonly("状态", statusLabels[task.status]);

  const content = `
    <div class="summary-strip">
      ${inputTile("wechat", "微信号", task.wechat)}
      ${inputTile("orderNo", "订单号", task.orderNo)}
      ${inputTile("taobaoId", "淘宝ID", task.taobaoId)}
    </div>
    <div class="work-strip">
      ${canEditTaskField(task, "assigneeId") ? `
        <label class="info-tile">
          <span>设计师</span>
          <select name="assigneeId">${designers.map((user) => `<option value="${user.id}" ${user.id === task.assigneeId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
      ` : readonly("设计师", task.assigneeName)}
      ${statusTile}
      ${canEditTaskField(task, "dueDate") ? `<label class="info-tile"><span>截止日期</span><input name="dueDate" type="date" value="${task.dueDate || ""}" /></label>` : readonly("截止日期", task.dueDate)}
    </div>
    <div class="design-strip">
      ${selectTile("taskType", "任务类型", task.taskType, taskTypeOptions(task.taskType))}
      ${inputTile("sizeSpec", "尺寸规格", task.sizeSpec)}
      ${selectTile("deliverFormat", "交付格式", task.deliverFormat, deliverFormatOptions(task.deliverFormat))}
    </div>
    <div class="inline-extra">
      ${canEditTaskField(task, "priority") ? `
        <label>
          <span>优先级</span>
          <select name="priority">${Object.keys(priorityLabels).map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${priorityLabels[priority]}</option>`).join("")}</select>
        </label>
      ` : readonly("优先级", priorityLabels[task.priority])}
      ${textareaBlock("description", "任务说明", task.description, "requirement-editor", 2)}
    </div>
    ${textareaBlock("customerRequirement", "客户原始需求", task.customerRequirement, "requirement-editor", 3)}
    ${editable || statusEditable ? '<button type="submit">保存修改</button>' : ""}
  `;

  return editable || statusEditable ? `<form class="inline-info-form" id="briefForm">${content}</form>` : `<div class="inline-info-form">${content}</div>`;
}
