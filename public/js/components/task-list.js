function renderTaskList(tasks) {
  if (!tasks.length) return '<div class="empty">没有匹配的任务</div>';
  const mode = state.layout === "list" ? "list-mode" : "";
  return `
    <div class="task-list ${mode}" id="taskList">
      ${tasks.map(renderTaskCard).join("")}
    </div>
  `;
}

function renderTaskCard(task) {
  return `
    <article class="task-card priority-${task.priority} ${task.id === state.selectedTaskId ? "selected" : ""}">
      <button class="task-button" type="button" data-task-id="${task.id}">
        <div>
          <strong class="task-title">${escapeHtml(task.title)}</strong>
          <p class="task-desc">${escapeHtml(task.description || "暂无说明")}</p>
        </div>
        <span class="pill ${task.status}">${statusLabels[task.status]}</span>
        <span class="pill ${task.priority}">${priorityLabels[task.priority]}</span>
        <span>${task.dueDate || "未设截止"}</span>
      </button>
      <div class="task-meta">
        <span>设计师：${escapeHtml(task.assigneeName)}</span>
        <span>${task.visibility === "private" ? "个人任务" : `客服：${escapeHtml(task.creatorName)}`}</span>
        <span>${task.dueDate ? `截止：${task.dueDate}` : "未设截止"}</span>
        ${task.orderNo ? `<span>订单：${escapeHtml(task.orderNo)}</span>` : ""}
      </div>
      ${task.remark ? `<div class="task-comment"><span>备注</span><p>${escapeHtml(task.remark)}</p></div>` : ""}
    </article>
  `;
}
