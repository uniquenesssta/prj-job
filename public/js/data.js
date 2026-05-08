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
  const modalWasOpen = Boolean(state.taskDetailModalOpen);
  await loadData();
  state.selectedTaskId = selected;
  state.taskDetailModalOpen = modalWasOpen;
  render();
}

function connectEvents() {
  ensureRealtimeCommentStyles();
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
  const shouldKeepDetailOpen = Boolean(state.taskDetailModalOpen && selected);
  state.realtimeLastEvent = { eventName, payload, receivedAt: new Date().toISOString() };

  if (shouldApplyCommentRealtimeLocally(eventName, payload, selected)) {
    mergeRealtimeComment(payload.comment);
    appendRealtimeCommentToOpenList(payload.comment);
    return;
  }

  if (shouldIgnoreCommentTaskRefresh(eventName, payload, selected)) return;

  queueRealtimeSync(async () => {
    await syncRealtimeData({ eventName, payload, selected, shouldKeepDetailOpen });
  });
}

function shouldApplyCommentRealtimeLocally(eventName, payload, selected) {
  return eventName === "comments-changed" && Boolean(selected) && payload?.taskId === selected && Boolean(payload.comment?.id);
}

function shouldIgnoreCommentTaskRefresh(eventName, payload, selected) {
  return eventName === "tasks-changed" && payload?.reason === "comment-created" && Boolean(selected) && payload.taskId === selected;
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
    state.taskDetailModalOpen = shouldKeepDetailOpen;
  } else if (state.selectedTaskId === selected) {
    state.selectedTaskId = null;
    state.taskDetailModalOpen = false;
  }
  render();
  restoreRealtimeScrollSnapshot(scrollSnapshot, eventName, payload);
}

function mergeRealtimeComment(comment) {
  if (!comment?.taskId || !comment.id) return false;
  const task = state.tasks.find((item) => item.id === comment.taskId);
  if (!task) return false;
  if (!Array.isArray(task.comments)) task.comments = [];
  if (task.comments.some((item) => item.id === comment.id)) return false;
  task.comments.push(comment);
  task.comments.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return true;
}

function appendRealtimeCommentToOpenList(comment, options = {}) {
  if (!comment?.id || comment.taskId !== state.selectedTaskId) return;
  const list = document.querySelector(".public-comments .comment-list");
  if (!list || list.querySelector(`[data-comment-id="${cssEscapeValue(comment.id)}"]`)) return;
  const wasAtBottom = options.forceScroll || list.scrollTop + list.clientHeight >= list.scrollHeight - 16;
  list.querySelector(".empty")?.remove();
  if (typeof renderPublicComment === "function") {
    list.insertAdjacentHTML("beforeend", renderPublicComment(comment));
  }
  if (wasAtBottom) list.scrollTop = list.scrollHeight;
}

function cssEscapeValue(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replaceAll('"', '\\"');
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

function ensureRealtimeCommentStyles() {
  if (document.querySelector("#realtimeCommentNoFlashStyles")) return;
  const style = document.createElement("style");
  style.id = "realtimeCommentNoFlashStyles";
  style.textContent = `
    .detail-layout { align-items: stretch; }
    .detail-layout > .detail-main { align-self: stretch; }
    .detail-layout > .comments.public-comments {
      align-self: stretch;
      height: auto;
      min-height: 430px;
    }
  `;
  document.head.appendChild(style);
}

function hydrateAssigneeFilter() {
  const designers = state.users.filter((user) => user.role === "designer");
  assigneeFilter.innerHTML = '<option value="all">全部</option>' + designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
}

function currentView() {
  if (state.user.role === "owner") return state.adminView;
  return state.user.role;
}
