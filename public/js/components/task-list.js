function renderTaskList(tasks) {
  if (!tasks.length) return '<div class="empty">没有匹配的任务</div>';
  const mode = state.layout === "list" ? "list-mode" : "";
  return `
    <div class="task-list ${mode}" id="taskList">
      ${tasks.map(renderTaskCard).join("")}
    </div>
  `;
}

function renderGroupedTaskList(tasks) {
  if (!tasks.length) return '<div class="empty">没有匹配的任务</div>';
  const groups = groupDesignerTasks(tasks).filter((group) => group.tasks.length);
  return `
    <div class="task-groups" id="taskList">
      ${groups.map((group) => `
        <section class="task-group ${group.tone}">
          <div class="task-group-head">
            <div>
              <strong>${group.label}</strong>
              <span>${group.hint}</span>
            </div>
            <b>${group.tasks.length}</b>
          </div>
          <div class="task-list ${state.layout === "list" ? "list-mode" : ""}">
            ${group.tasks.map(renderTaskCard).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function groupDesignerTasks(tasks) {
  const groups = [
    { key: "overdue", label: "已超时", hint: "先处理，避免继续拖延", tone: "danger", tasks: [] },
    { key: "today", label: "今日截止", hint: "今天必须给到结果", tone: "warning", tasks: [] },
    { key: "urgent", label: "加急任务", hint: "优先插队处理", tone: "danger", tasks: [] },
    { key: "doing", label: "进行中", hint: "正在推进的任务", tone: "active", tasks: [] },
    { key: "review", label: "待审核", hint: "需要检查或等确认", tone: "review", tasks: [] },
    { key: "todo", label: "未开始", hint: "排队等待处理", tone: "neutral", tasks: [] },
    { key: "blocked", label: "卡住", hint: "需要补资料或沟通", tone: "blocked", tasks: [] },
    { key: "done", label: "已完成", hint: "可以收尾归档", tone: "done", tasks: [] },
  ];
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
  sortTasksForDesigner(tasks).forEach((task) => {
    byKey[designerTaskGroupKey(task)].tasks.push(task);
  });
  return groups;
}

function designerTaskGroupKey(task) {
  if (task.status === "done") return "done";
  if (isOverdue(task)) return "overdue";
  if (isDueToday(task)) return "today";
  if (task.priority === "urgent") return "urgent";
  if (task.status === "doing") return "doing";
  if (task.status === "review") return "review";
  if (task.status === "blocked") return "blocked";
  return "todo";
}

function sortTasksForDesigner(tasks) {
  const priorityScore = { urgent: 0, high: 1, normal: 2, low: 3 };
  return tasks.slice().sort((a, b) => {
    const due = dueTime(a) - dueTime(b);
    if (due !== 0) return due;
    const priority = (priorityScore[a.priority] ?? 9) - (priorityScore[b.priority] ?? 9);
    if (priority !== 0) return priority;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
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
      ${renderTaskSignals(task)}
      ${renderTaskCardActions(task)}
      <div class="task-meta">
        <span>设计师：${escapeHtml(task.assigneeName)}</span>
        <span>${task.visibility === "private" ? "个人任务" : `客服：${escapeHtml(task.creatorName)}`}</span>
        <span>${task.dueDate ? `截止：${task.dueDate}` : "未设截止"}</span>
        ${task.orderNo ? `<span>订单：${escapeHtml(task.orderNo)}</span>` : ""}
        ${task.taskType ? `<span>类型：${escapeHtml(task.taskType)}</span>` : ""}
        ${task.sizeSpec ? `<span>尺寸：${escapeHtml(task.sizeSpec)}</span>` : ""}
        ${task.deliverFormat ? `<span>格式：${escapeHtml(task.deliverFormat)}</span>` : ""}
        <span>附件：${(task.attachments || []).length}</span>
        <span>${task.visibility === "private" ? `备注：${(state.personalNotesByTask[task.id] || task.remarkRecords || []).length}` : `留言：${(task.comments || []).length}`}</span>
      </div>
      ${preview ? `<div class="task-comment"><span>${preview.label}</span><p>${escapeHtml(preview.text)}</p></div>` : ""}
    </article>
  `;
}

function renderTaskCardActions(task) {
  if (state.user.role !== "owner" || task.archivedAt) return "";
  return `
    <div class="task-card-actions">
      <button class="button danger compact-button" type="button" data-delete-task-id="${task.id}">删除</button>
    </div>
  `;
}

function renderTaskSignals(task) {
  const messages = taskMessageCount(task);
  const files = (task.attachments || []).length;
  const dueLabel = task.status === "done"
    ? "已完成"
    : isOverdue(task)
    ? "已超时"
    : isDueToday(task)
    ? "今日截止"
    : task.dueDate
    ? `截止 ${task.dueDate}`
    : "未设截止";
  const dueTone = task.status === "done" ? "done" : isOverdue(task) ? "danger" : isDueToday(task) ? "warning" : "neutral";
  return `
    <div class="task-signals">
      <span class="signal ${dueTone}">${dueLabel}</span>
      <span class="signal">留言/备注 ${messages}</span>
      <span class="signal">附件 ${files}</span>
      <span class="signal">更新 ${formatDateTime(task.updatedAt || task.createdAt || new Date().toISOString())}</span>
    </div>
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
