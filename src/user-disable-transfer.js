const ACTIVE_TASK_STATUSES = new Set(["todo", "doing", "review", "blocked"]);
const DISABLE_TRANSFER_ACTIONS = new Set(["keep", "transfer", "unassign"]);

function activeResponsibilities(db, user) {
  if (!db || !user) return [];
  return db.tasks.filter((task) => {
    if (!task || task.deletedAt || task.archivedAt || !ACTIVE_TASK_STATUSES.has(task.status)) return false;
    if (user.role === "designer") return task.assigneeId === user.id;
    if (user.role === "service") return task.creatorId === user.id && task.visibility !== "private";
    return false;
  });
}

function disableResponsibilitySummary(db, user) {
  const tasks = activeResponsibilities(db, user);
  return {
    role: user?.role || "",
    count: tasks.length,
    taskIds: tasks.map((task) => task.id),
  };
}

function validateDisableTransfer(db, target, body) {
  const summary = disableResponsibilitySummary(db, target);
  if (!summary.count) return { ok: true, summary, action: "keep" };

  const action = String(body.disableTransferAction || "keep").trim();
  if (!DISABLE_TRANSFER_ACTIONS.has(action)) {
    return { ok: false, summary, error: responsibilityRequiredMessage(target, summary) };
  }
  if (target.role === "service" && action === "unassign") {
    return { ok: false, summary, error: "客服账号不能将客户跟进人改为待分配，请选择保持或转移。" };
  }
  if (action !== "transfer") return { ok: true, summary, action };

  const transferToUserId = String(body.transferToUserId || "").trim();
  const expectedRole = target.role === "designer" ? "designer" : "service";
  const nextUser = db.users.find((user) => user.id === transferToUserId && user.role === expectedRole && !user.disabledAt && !user.deletedAt);
  if (!nextUser || nextUser.id === target.id) {
    const label = target.role === "designer" ? "设计师" : "客服";
    return { ok: false, summary, error: `请选择一个启用中的其他${label}接收未完成任务。` };
  }
  return { ok: true, summary, action, transferToUserId };
}

function applyDisableTransfer(db, target, validation, now) {
  if (!validation?.summary?.count || validation.action === "keep") return { affected: 0, action: validation?.action || "keep" };
  const tasks = activeResponsibilities(db, target);
  if (validation.action === "unassign" && target.role === "designer") {
    tasks.forEach((task) => {
      task.assigneeId = "";
      task.updatedAt = now;
    });
    return { affected: tasks.length, action: "unassign" };
  }
  if (validation.action === "transfer") {
    tasks.forEach((task) => {
      if (target.role === "designer") task.assigneeId = validation.transferToUserId;
      if (target.role === "service") task.creatorId = validation.transferToUserId;
      task.updatedAt = now;
    });
    return { affected: tasks.length, action: "transfer", transferToUserId: validation.transferToUserId };
  }
  return { affected: 0, action: validation.action };
}

function responsibilityRequiredMessage(user, summary) {
  if (user?.role === "designer") {
    return `该设计师还有 ${summary.count} 个未完成任务，请先选择保持负责人、转移给其他设计师或改为待分配。`;
  }
  if (user?.role === "service") {
    return `该客服还有 ${summary.count} 个未完成跟进任务，请先选择保持跟进人或转移给其他客服。`;
  }
  return "该账号仍有关联责任，请先选择处理方式。";
}

module.exports = {
  ACTIVE_TASK_STATUSES,
  applyDisableTransfer,
  disableResponsibilitySummary,
  validateDisableTransfer,
};
