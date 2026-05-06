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
  const preview = taskPreviewMessage(task);
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
      ${preview ? `<div class="task-comment"><span>${preview.label}</span><p>${escapeHtml(preview.text)}</p></div>` : ""}
    </article>
  `;
}

function taskPreviewMessage(task) {
  if (task.visibility === "private") {
    const records = (task.remarkRecords || []).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const record = records.find((item) => item.text);
    const text = record?.text || task.remark;
    return text ? { label: "备注", text } : null;
  }
  const comments = (task.comments || []).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const comment = comments.find((item) => item.text);
  return comment ? { label: "最新留言", text: comment.text } : null;
}
