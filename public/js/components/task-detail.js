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

function renderArchiveControls(task) {
  if (state.user.role !== "owner") return "";
  if (task.archivedAt) {
    return `
      <div class="archive-actions">
        <span>已归档：${formatDateTime(task.archivedAt)}</span>
        <button class="button secondary" id="restoreTaskButton" type="button">恢复显示</button>
      </div>
    `;
  }
  if (task.status === "done") {
    return `
      <div class="archive-actions">
        <span>已完成，可单独归档</span>
        <button class="button" id="archiveTaskButton" type="button">归档此任务</button>
      </div>
    `;
  }
  return "";
}

function renderInlineInfo(task) {
  const editable = canEditBrief(task);
  const designers = state.users.filter((user) => user.role === "designer");
  const readonly = (label, value) => `<div class="info-tile"><span>${label}</span><strong>${escapeHtml(value || "未填写")}</strong></div>`;

  if (!editable) {
    return `
      <form class="inline-info-form" id="statusForm">
        <div class="summary-strip">
          ${readonly("微信号", task.wechat)}
          ${readonly("订单号", task.orderNo)}
          ${readonly("淘宝ID", task.taobaoId)}
        </div>
        <div class="work-strip">
          ${readonly("设计师", task.assigneeName)}
          ${readonly("客服", task.creatorName)}
          <label class="info-tile status-cell"><span>状态</span><select name="status">${statusOptions(task.status)}</select></label>
        </div>
        <button type="submit">更新状态</button>
      </form>
    `;
  }

  return `
    <form class="inline-info-form" id="briefForm">
      <div class="summary-strip">
        <label class="info-tile"><span>微信号</span><input name="wechat" value="${escapeAttr(task.wechat || "")}" /></label>
        <label class="info-tile"><span>订单号</span><input name="orderNo" value="${escapeAttr(task.orderNo || "")}" /></label>
        <label class="info-tile"><span>淘宝ID</span><input name="taobaoId" value="${escapeAttr(task.taobaoId || "")}" /></label>
      </div>
      <div class="work-strip">
        <label class="info-tile">
          <span>设计师</span>
          <select name="assigneeId">${designers.map((user) => `<option value="${user.id}" ${user.id === task.assigneeId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
        <label class="info-tile"><span>状态</span><select name="status">${statusOptions(task.status)}</select></label>
        <label class="info-tile"><span>截止日期</span><input name="dueDate" type="date" value="${task.dueDate || ""}" /></label>
      </div>
      <div class="inline-extra">
        <label>
          <span>优先级</span>
          <select name="priority">${Object.keys(priorityLabels).map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${priorityLabels[priority]}</option>`).join("")}</select>
        </label>
        <label>
          <span>任务说明</span>
          <textarea name="description" rows="2">${escapeHtml(task.description || "")}</textarea>
        </label>
      </div>
      <button type="submit">保存修改</button>
    </form>
  `;
}

function statusOptions(currentStatus) {
  return Object.keys(statusLabels).map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${statusLabels[status]}</option>`).join("");
}

function renderBriefEditor(task) {
  const designers = state.users.filter((user) => user.role === "designer");
  return `
    <form class="update-form divider" id="briefForm">
      <label><span>任务说明</span><textarea name="description" rows="3">${escapeHtml(task.description || "")}</textarea></label>
      <div class="update-grid">
        <label><span>微信号</span><input name="wechat" value="${escapeAttr(task.wechat || "")}" /></label>
        <label><span>订单号</span><input name="orderNo" value="${escapeAttr(task.orderNo || "")}" /></label>
      </div>
      <label><span>淘宝ID</span><input name="taobaoId" value="${escapeAttr(task.taobaoId || "")}" /></label>
      <div class="update-grid">
        <label>
          <span>改派设计师</span>
          <select name="assigneeId">${designers.map((user) => `<option value="${user.id}" ${user.id === task.assigneeId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
        <label><span>截止日期</span><input name="dueDate" type="date" value="${task.dueDate || ""}" /></label>
      </div>
      <label>
        <span>优先级</span>
        <select name="priority">${Object.keys(priorityLabels).map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${priorityLabels[priority]}</option>`).join("")}</select>
      </label>
      <button type="submit">保存修改</button>
    </form>
  `;
}

function renderStatusEditor(task) {
  return `
    <form class="update-form divider" id="statusForm">
      <label>
        <span>状态</span>
        <select name="status">${Object.keys(statusLabels).map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}</select>
      </label>
      <button type="submit">更新状态</button>
    </form>
  `;
}
