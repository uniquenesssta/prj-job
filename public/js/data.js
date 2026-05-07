async function loadData() {
  const taskUrl = userHasPermission("archives.manage") && state.adminView === "archived" ? "/api/tasks?archived=1" : "/api/tasks";
  const [usersData, tasksData, departmentsData] = await Promise.all([api("/api/users"), api(taskUrl), api("/api/departments")]);
  state.users = usersData.users;
  state.tasks = tasksData.tasks;
  state.departments = departmentsData.departments || [];
  if (state.selectedTaskId && state.tasks.some((task) => task.id === state.selectedTaskId)) {
    await loadPersonalNotes(state.selectedTaskId);
  }
  hydrateAssigneeFilter();
}

async function loadPersonalNotes(taskId) {
  if (!taskId) return;
  try {
    const data = await api(`/api/tasks/${taskId}/personal-note`);
    state.personalNotesByTask[taskId] = data.notes || [];
  } catch {
    state.personalNotesByTask[taskId] = [];
  }
}

async function reloadTasks() {
  const selected = state.selectedTaskId;
  await loadData();
  state.selectedTaskId = selected;
  render();
}

function connectEvents() {
  if (state.events) state.events.close();
  state.events = new EventSource("/api/events");
  const refresh = async () => {
    const selected = state.selectedTaskId;
    await loadData();
    state.selectedTaskId = selected;
    render();
  };
  for (const eventName of ["tasks-changed", "files-changed", "comments-changed", "users-changed"]) {
    state.events.addEventListener(eventName, refresh);
  }
}

function hydrateAssigneeFilter() {
  const designers = state.users.filter((user) => user.role === "designer");
  assigneeFilter.innerHTML = '<option value="all">全部</option>' + designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
}

function currentView() {
  if (state.user.role === "owner") return state.adminView;
  return state.user.role;
}
