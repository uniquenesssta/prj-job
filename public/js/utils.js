function filteredTasks(view) {
  return state.tasks.filter((task) => {
    const archivedOk = view === "archived" ? Boolean(task.archivedAt) : !task.archivedAt;
    const designerViewOk = view !== "designer" || (state.designerView === "private" ? task.visibility === "private" : task.visibility !== "private");
    const statusOk = state.status === "all" || task.status === state.status;
    const assigneeOk = state.assignee === "all" || task.assigneeId === state.assignee || view !== "designer" || state.user.role !== "owner";
    const text = `${task.title} ${task.description} ${task.remark || ""} ${task.assigneeName} ${task.creatorName} ${task.wechat} ${task.orderNo} ${task.taobaoId} ${task.taskType || ""} ${task.sizeSpec || ""} ${task.deliverFormat || ""} ${task.customerRequirement || ""}`.toLowerCase();
    const searchOk = !state.search || text.includes(state.search);
    const quickOk = matchesQuickFilter(task);
    return archivedOk && designerViewOk && statusOk && assigneeOk && searchOk && quickOk;
  });
}

function matchesQuickFilter(task) {
  switch (state.quickFilter) {
    case "urgent":
      return task.priority === "urgent" && task.status !== "done";
    case "today":
      return isDueToday(task);
    case "overdue":
      return isOverdue(task);
    case "messages":
      return taskMessageCount(task) > 0;
    case "files":
      return (task.attachments || []).length > 0;
    case "createdByMe":
      return task.creatorId === state.user.id;
    case "assignedToMe":
      return task.assigneeId === state.user.id;
    default:
      return true;
  }
}

function taskMessageCount(task) {
  if (task.visibility === "private") {
    return (state.personalNotesByTask[task.id] || task.remarkRecords || []).length;
  }
  return (task.comments || []).length;
}

function canEditBrief(task) {
  return state.user.role === "owner"
    || (state.user.role === "service" && task.creatorId === state.user.id)
    || (state.user.role === "designer" && task.visibility === "private" && task.creatorId === state.user.id);
}

function latestComment(task) {
  const comments = task.comments || [];
  return comments[comments.length - 1] || null;
}

function recentComments(task, count) {
  return (task.comments || []).slice(-count).reverse();
}

function isDueSoon(task) {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.dueDate}T00:00:00`);
  const days = Math.ceil((due - today) / 86400000);
  return days >= 0 && days <= 3;
}

function isDueToday(task) {
  if (!task.dueDate || task.status === "done") return false;
  return dueTime(task) === todayTime();
}

function isOverdue(task) {
  if (!task.dueDate || task.status === "done") return false;
  return dueTime(task) < todayTime();
}

function todayTime() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function dueTime(task) {
  if (!task.dueDate) return Number.MAX_SAFE_INTEGER;
  const due = new Date(`${task.dueDate}T00:00:00`);
  return Number.isNaN(due.getTime()) ? Number.MAX_SAFE_INTEGER : due.getTime();
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function resetOverviewPanelContext() {
  state.selectedDesignerId = "";
  state.selectedServiceId = "";
  state.overviewTaskFilter = "all";
  state.overviewSearch = "";
}

function toggleExclusivePanel(stateKey, panel, options = {}) {
  const nextPanel = state[stateKey] === panel ? "" : panel;
  state[stateKey] = nextPanel;
  if (typeof options.afterToggle === "function") options.afterToggle(nextPanel);
  return nextPanel;
}

function openExclusivePanel(stateKey, panel, options = {}) {
  state[stateKey] = panel;
  if (typeof options.afterOpen === "function") options.afterOpen(panel);
  return panel;
}

function toggleScopedExclusivePanel(config) {
  const {
    stateKey,
    panel,
    scopeKey,
    scopeValue,
    afterToggle,
  } = config;
  const isSameEntry = state[stateKey] === panel && state[scopeKey] === scopeValue;
  state[stateKey] = isSameEntry ? "" : panel;
  state[scopeKey] = isSameEntry ? "" : scopeValue;
  if (typeof afterToggle === "function") afterToggle(state[stateKey], state[scopeKey]);
  return state[stateKey];
}

function toggleOverviewPanel(panel) {
  return toggleExclusivePanel("overviewExpandedPanel", panel, {
    afterToggle: resetOverviewPanelContext,
  });
}

function openOverviewPanel(panel) {
  return openExclusivePanel("overviewExpandedPanel", panel);
}

function toggleOverviewDesignerPanel(designerId) {
  const nextPanel = toggleScopedExclusivePanel({
    stateKey: "overviewExpandedPanel",
    panel: "designerTasks",
    scopeKey: "selectedDesignerId",
    scopeValue: designerId,
  });
  state.overviewTaskFilter = "all";
  state.overviewSearch = "";
  return nextPanel;
}

function toggleOverviewServicePanel(serviceId) {
  const nextPanel = toggleScopedExclusivePanel({
    stateKey: "overviewExpandedPanel",
    panel: "serviceTasks",
    scopeKey: "selectedServiceId",
    scopeValue: serviceId,
  });
  state.selectedDesignerId = "";
  state.overviewTaskFilter = "all";
  state.overviewSearch = "";
  return nextPanel;
}
