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
  const realtimeEvents = ["tasks-changed", "files-changed", "comments-changed", "users-changed", "departments-changed", "system-changed"];
  realtimeEvents.forEach((eventName) => {
    state.events.addEventListener(eventName, (event) => {
      handleRealtimeEvent(eventName, parseRealtimePayload(event));
    });
  });
  state.events.addEventListener("error", () => {
    state.realtimeConnected = false;
  });
  state.events.addEventListener("ready", () => {
    state.realtimeConnected = true;
  });
}

function parseRealtimePayload(event) {
  try {
    return JSON.parse(event.data || "{}");
  } catch {
    return {};
  }
}

function handleRealtimeEvent(eventName, payload = {}) {
  const selected = state.selectedTaskId;
  const detailOpen = Boolean(state.taskDetailModalOpen || selected);
  const shouldKeepDetailOpen = detailOpen && selected;
  state.realtimeLastEvent = { eventName, payload, receivedAt: new Date().toISOString() };
  queueRealtimeSync(async () => {
    await syncRealtimeData({ eventName, payload, selected, shouldKeepDetailOpen });
  });
}

function queueRealtimeSync(syncer) {
  state.realtimeSyncQueue = syncer;
  if (state.realtimeSyncing) return;
  state.realtimeSyncing = true;
  setTimeout(runRealtimeSyncQueue, 80);
}

async function runRealtimeSyncQueue() {
  const syncer = state.realtimeSyncQueue;
  state.realtimeSyncQueue = null;
  try {
    if (typeof syncer === "function") await syncer();
  } finally {
    state.realtimeSyncing = false;
    if (state.realtimeSyncQueue) {
      state.realtimeSyncing = true;
      setTimeout(runRealtimeSyncQueue, 80);
    }
  }
}

async function syncRealtimeData({ eventName, payload, selected, shouldKeepDetailOpen }) {
  const scrollSnapshot = captureRealtimeScrollSnapshot();
  await loadData();
  if (selected && state.tasks.some((task) => task.id === selected)) {
    state.selectedTaskId = selected;
    if (shouldKeepDetailOpen) state.taskDetailModalOpen = true;
  } else if (state.selectedTaskId === selected) {
    state.selectedTaskId = null;
    state.taskDetailModalOpen = false;
  }
  render();
  restoreRealtimeScrollSnapshot(scrollSnapshot, eventName, payload);
}

function captureRealtimeScrollSnapshot() {
  const commentList = document.querySelector(".public-comments .comment-list");
  return {
    windowY: window.scrollY,
    commentAtBottom: commentList ? commentList.scrollTop + commentList.clientHeight >= commentList.scrollHeight - 16 : false,
    commentScrollTop: commentList?.scrollTop || 0,
  };
}

function restoreRealtimeScrollSnapshot(snapshot, eventName, payload) {
  const commentList = document.querySelector(".public-comments .comment-list");
  if (commentList) {
    if (eventName === "comments-changed" && payload.taskId === state.selectedTaskId && snapshot.commentAtBottom) {
      commentList.scrollTop = commentList.scrollHeight;
    } else {
      commentList.scrollTop = snapshot.commentScrollTop;
    }
  }
  window.scrollTo({ top: snapshot.windowY });
}

function hydrateAssigneeFilter() {
  const designers = state.users.filter((user) => user.role === "designer");
  assigneeFilter.innerHTML = '<option value="all">全部</option>' + designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
}

function currentView() {
  if (state.user.role === "owner") return state.adminView;
  return state.user.role;
}
