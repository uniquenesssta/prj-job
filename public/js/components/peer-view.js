function renderPeerViewModal() {
  if (!state.peerViewModal) return "";
  const mode = state.peerViewModal;
  const role = mode === "services" ? "service" : "designer";
  const title = mode === "services" ? "其他客服" : "其他设计师";
  const users = state.users.filter((user) => user.role === role && user.id !== state.user.id && !user.deletedAt);
  const keyword = state.peerViewSearch.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    const text = `${user.name} ${user.username} ${departmentName(user.departmentId)}`.toLowerCase();
    return !keyword || text.includes(keyword);
  });
  if (!state.peerViewSelectedId || !visibleUsers.some((user) => user.id === state.peerViewSelectedId)) {
    state.peerViewSelectedId = visibleUsers[0]?.id || "";
  }
  const selected = visibleUsers.find((user) => user.id === state.peerViewSelectedId);
  const tasks = selected ? peerTasksForUser(selected, mode) : [];

  return `
    <div class="modal-backdrop peer-view-backdrop" id="peerViewBackdrop">
      <section class="modal-card peer-view-card">
        <div class="peer-view-head">
          <div>
            <p class="eyebrow">Permission View</p>
            <h2>${title}</h2>
          </div>
          <button class="icon-button" id="closePeerView" type="button">×</button>
        </div>
        <div class="peer-view-toolbar">
          <label>
            <span>搜索人员</span>
            <input id="peerViewSearchInput" value="${escapeAttr(state.peerViewSearch)}" placeholder="姓名、账号、部门" />
          </label>
          <label>
            <span>任务状态</span>
            <select id="peerViewStatusFilter">
              <option value="all" ${state.peerViewStatus === "all" ? "selected" : ""}>全部</option>
              ${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}" ${state.peerViewStatus === key ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="peer-view-layout">
          <aside class="peer-user-list">
            ${visibleUsers.length ? visibleUsers.map((user) => renderPeerUserCard(user, mode)).join("") : '<div class="empty">没有可查看的人员</div>'}
          </aside>
          <section class="peer-task-panel">
            ${selected ? renderPeerTaskPanel(selected, mode, tasks) : '<div class="empty">请选择一个人员</div>'}
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderPeerUserCard(user, mode) {
  const tasks = peerTasksForUser(user, mode);
  const active = user.id === state.peerViewSelectedId ? "active" : "";
  return `
    <button class="peer-user-card ${active}" type="button" data-peer-user-id="${user.id}">
      <span>${roleLabels[user.role] || user.role}</span>
      <strong>${escapeHtml(user.name)}</strong>
      <small>${escapeHtml(departmentName(user.departmentId))}</small>
      <b>${tasks.length}</b>
    </button>
  `;
}

function renderPeerTaskPanel(user, mode, tasks) {
  const filtered = tasks.filter((task) => state.peerViewStatus === "all" || task.status === state.peerViewStatus);
  const doing = tasks.filter((task) => task.status === "doing").length;
  const overdue = tasks.filter(isOverdue).length;
  const label = mode === "services" ? "发布任务" : "负责任务";
  return `
    <div class="peer-task-head">
      <div>
        <p class="eyebrow">${label}</p>
        <h3>${escapeHtml(user.name)}</h3>
      </div>
      <div class="peer-stats">
        <span>总数 <b>${tasks.length}</b></span>
        <span>进行中 <b>${doing}</b></span>
        <span>超时 <b>${overdue}</b></span>
      </div>
    </div>
    <div class="peer-task-list">
      ${filtered.length ? filtered.map(renderPeerTaskCard).join("") : '<div class="empty">没有匹配的任务</div>'}
    </div>
  `;
}

function renderPeerTaskCard(task) {
  const message = taskPreviewMessage(task);
  return `
    <article class="peer-task-card priority-${task.priority}">
      <button type="button" data-peer-task-id="${task.id}">
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <p>${escapeHtml(task.description || "暂无说明")}</p>
        </div>
        <span class="pill ${task.status}">${statusLabels[task.status]}</span>
      </button>
      <div class="task-meta">
        <span>设计师：${escapeHtml(task.assigneeName)}</span>
        <span>客服：${escapeHtml(task.creatorName)}</span>
        <span>${task.dueDate || "未设截止"}</span>
        <span>留言 ${taskMessageCount(task)}</span>
      </div>
      ${message ? `<div class="task-comment"><span>${message.label}</span><p>${escapeHtml(message.text)}</p></div>` : ""}
    </article>
  `;
}

function peerTasksForUser(user, mode) {
  return state.tasks
    .filter((task) => !task.archivedAt && !task.deletedAt && task.visibility !== "private")
    .filter((task) => mode === "services" ? task.creatorId === user.id : task.assigneeId === user.id)
    .sort((a, b) => dueTime(a) - dueTime(b));
}

function bindPeerViewEvents() {
  document.querySelector("#peerViewBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "peerViewBackdrop") return;
    closePeerView();
  });
  document.querySelector("#closePeerView")?.addEventListener("click", closePeerView);
  document.querySelector("#peerViewSearchInput")?.addEventListener("input", (event) => {
    state.peerViewSearch = event.currentTarget.value.trim().toLowerCase();
    state.peerViewSelectedId = "";
    render();
  });
  document.querySelector("#peerViewStatusFilter")?.addEventListener("change", (event) => {
    state.peerViewStatus = event.currentTarget.value;
    render();
  });
  document.querySelector(".peer-user-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-peer-user-id]");
    if (!button) return;
    state.peerViewSelectedId = button.dataset.peerUserId;
    render();
  });
  document.querySelector(".peer-task-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-peer-task-id]");
    if (!button) return;
    state.selectedTaskId = button.dataset.peerTaskId;
    state.taskDetailModalOpen = true;
    state.briefEditOpen = false;
    await loadPersonalNotes(state.selectedTaskId);
    render();
  });
}

function closePeerView() {
  state.peerViewModal = "";
  state.peerViewSelectedId = "";
  state.peerViewSearch = "";
  state.peerViewStatus = "all";
  adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", Boolean(item.dataset.workspaceHome)));
  render();
}
