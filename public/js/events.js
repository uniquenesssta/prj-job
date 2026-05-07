function bindStaticEvents() {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const form = new FormData(loginForm);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: {
          username: form.get("username"),
          password: form.get("password"),
        },
      });
      state.user = data.user;
      await loadData();
      showApp();
      connectEvents();
    } catch (error) {
      loginError.textContent = error.message;
    }
  });

  document.querySelector("#logoutButton").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    state.selectedTaskId = null;
    state.briefEditOpen = false;
    if (state.events) state.events.close();
    state.events = null;
    showLogin();
  });

  adminTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-admin-view]");
    if (!button) return;
    state.adminView = button.dataset.adminView;
    state.selectedTaskId = null;
    state.briefEditOpen = false;
    adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    await loadData();
    render();
  });

  viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button) return;
    state.status = button.dataset.status;
    viewTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });

  assigneeFilter.addEventListener("change", () => {
    state.assignee = assigneeFilter.value;
    render();
  });

  quickFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-quick-filter]");
    if (!button) return;
    state.quickFilter = button.dataset.quickFilter;
    render();
  });

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.trim().toLowerCase();
    render();
  });

  layoutSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-layout]");
    if (!button) return;
    state.layout = button.dataset.layout;
    layoutSwitch.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
}

function bindTaskPageEvents() {
  document.querySelector("#refreshTasks")?.addEventListener("click", reloadTasks);
  document.querySelector("#taskList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-task-id]");
    if (!button) return;
    state.selectedTaskId = button.dataset.taskId;
    state.briefEditOpen = false;
    state.pendingRemarkImages = [];
    await loadPersonalNotes(state.selectedTaskId);
    render();
  });
  bindDetailEvents();
}

function bindDetailEvents() {
  document.querySelector("#archiveTaskButton")?.addEventListener("click", async () => {
    await api(`/api/tasks/${state.selectedTaskId}/archive`, { method: "POST" });
    state.selectedTaskId = null;
    await loadData();
    render();
  });

  document.querySelector("#restoreTaskButton")?.addEventListener("click", async () => {
    await api(`/api/tasks/${state.selectedTaskId}/restore`, { method: "POST" });
    state.selectedTaskId = null;
    await loadData();
    render();
  });

  document.querySelector("#toggleBriefEdit")?.addEventListener("click", () => {
    state.briefEditOpen = !state.briefEditOpen;
    render();
  });

  document.querySelector("#briefForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateTask(Object.fromEntries(new FormData(event.currentTarget).entries()));
    state.briefEditOpen = false;
  });

  document.querySelector("#statusForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateTask({ status: form.get("status") });
  });

  document.querySelector("#uploadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    button.textContent = "上传中";
    try {
      await api(`/api/tasks/${state.selectedTaskId}/upload`, { method: "POST", body: new FormData(event.currentTarget) });
      await loadData();
      render();
    } finally {
      button.disabled = false;
      button.textContent = "上传文件";
    }
  });

  bindPublicCommentEvents();
  bindPersonalRemarkEvents();
  bindRemarkImageViewerEvents();
}

async function updateTask(body) {
  await api(`/api/tasks/${state.selectedTaskId}`, { method: "PATCH", body });
  await loadData();
  render();
}
