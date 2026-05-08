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

  if (shouldApplyCommentDeleteLocally(eventName, payload, selected)) {
    removeRealtimeComment(payload.taskId, payload.commentId);
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

function shouldApplyCommentDeleteLocally(eventName, payload, selected) {
  return eventName === "comments-changed" && payload?.reason === "comment-deleted" && Boolean(selected) && payload.taskId === selected && Boolean(payload.commentId);
}

function shouldIgnoreCommentTaskRefresh(eventName, payload, selected) {
  return eventName === "tasks-changed" && ["comment-created", "comment-deleted"].includes(payload?.reason) && Boolean(selected) && payload.taskId === selected;
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
  syncPublicCommentsLayoutHeight();
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
  syncPublicCommentsLayoutHeight();
  const wasAtBottom = options.forceScroll || list.scrollTop + list.clientHeight >= list.scrollHeight - 16;
  list.querySelector(".empty")?.remove();
  if (typeof renderPublicComment === "function") {
    list.insertAdjacentHTML("beforeend", renderPublicComment(comment));
  }
  syncPublicCommentsLayoutHeight();
  if (wasAtBottom) list.scrollTop = list.scrollHeight;
}

function removeRealtimeComment(taskId, commentId) {
  if (!taskId || !commentId) return false;
  const task = state.tasks.find((item) => item.id === taskId);
  if (task && Array.isArray(task.comments)) {
    task.comments = task.comments.filter((comment) => comment.id !== commentId);
  }
  const node = document.querySelector(`.public-comments .comment-list [data-comment-id="${cssEscapeValue(commentId)}"]`);
  const list = node?.closest(".comment-list");
  node?.remove();
  if (list && !list.querySelector(".message-card")) {
    list.innerHTML = '<div class="empty small-empty">还没有留言</div>';
  }
  syncPublicCommentsLayoutHeight();
  return true;
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
    .detail-layout { align-items: start; }
    .detail-layout > .detail-main { align-self: start; }
    .detail-layout > .comments.public-comments {
      align-self: start;
      overflow: hidden;
      min-height: 430px;
    }
    .public-comments .comment-list {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .message-actions {
      display: grid;
      justify-items: end;
      gap: 4px;
    }
    .message-delete,
    .remark-delete {
      min-height: 24px;
      border: 1px solid rgba(207, 77, 64, 0.28);
      border-radius: 999px;
      background: rgba(207, 77, 64, 0.08);
      color: var(--red);
      padding: 0 8px;
      font-size: 0.76rem;
      font-weight: 900;
    }
  `;
  document.head.appendChild(style);
  if (!state.realtimeCommentHeightObserver) {
    state.realtimeCommentHeightObserver = new MutationObserver(() => requestAnimationFrame(syncPublicCommentsLayoutHeight));
    state.realtimeCommentHeightObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", () => requestAnimationFrame(syncPublicCommentsLayoutHeight));
  }
  requestAnimationFrame(syncPublicCommentsLayoutHeight);
}

function syncPublicCommentsLayoutHeight() {
  const layout = document.querySelector(".detail-layout:not(.solo-detail)");
  const comments = layout?.querySelector(".comments.public-comments");
  const main = layout?.querySelector(".detail-main");
  if (!layout || !comments || !main) return;
  comments.style.height = "auto";
  comments.style.maxHeight = "";
  comments.style.minHeight = "430px";
  const mainHeight = Math.ceil(main.getBoundingClientRect().height);
  const lockedHeight = Math.max(430, mainHeight);
  comments.style.height = `${lockedHeight}px`;
  comments.style.maxHeight = `${lockedHeight}px`;
  comments.style.minHeight = `${lockedHeight}px`;
}

function hydrateAssigneeFilter() {
  const designers = state.users.filter((user) => user.role === "designer");
  assigneeFilter.innerHTML = '<option value="all">全部</option>' + designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
}

function currentView() {
  if (state.user.role === "owner") return state.adminView;
  return state.user.role;
}
