function filteredTasks(view) {
  return state.tasks.filter((task) => {
    const archivedOk = view === "archived" ? Boolean(task.archivedAt) : !task.archivedAt;
    const designerViewOk = view !== "designer" || (state.designerView === "private" ? task.visibility === "private" : task.visibility !== "private");
    const statusOk = state.status === "all" || task.status === state.status;
    const assigneeOk = state.assignee === "all" || task.assigneeId === state.assignee || view !== "designer" || state.user.role !== "owner";
    const text = `${task.title} ${task.description} ${task.remark || ""} ${task.assigneeName} ${task.creatorName} ${task.wechat} ${task.orderNo} ${task.taobaoId}`.toLowerCase();
    const searchOk = !state.search || text.includes(state.search);
    return archivedOk && designerViewOk && statusOk && assigneeOk && searchOk;
  });
}

function canEditBrief(task) {
  return state.user.role === "owner" || (state.user.role === "service" && task.creatorId === state.user.id);
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
