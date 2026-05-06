async function loadData() {
  const taskUrl = state.user?.role === "owner" && state.adminView === "archived" ? "/api/tasks?archived=1" : "/api/tasks";
  const [usersData, tasksData] = await Promise.all([api("/api/users"), api(taskUrl)]);
  state.users = usersData.users;
  state.tasks = tasksData.tasks;
  hydrateAssigneeFilter();
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
