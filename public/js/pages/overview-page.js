function renderOverviewPage() {
  const tasks = state.tasks.filter((task) => !task.archivedAt);
  const dashboard = buildDashboard(tasks);
  workspace.className = "workspace overview";
  workspace.innerHTML = `
    <section class="panel overview-main">
      <div class="section-head">
        <div>
          <p class="eyebrow">Overview</p>
          <h2>团队负载</h2>
        </div>
      </div>
      <div class="overview-grid">
        ${dashboard.designerRows.map(renderDesignerLoadCard).join("")}
      </div>
    </section>
    <aside class="panel overview-side">
      <div class="section-head">
        <div>
          <p class="eyebrow">Risk</p>
          <h2>需要关注</h2>
        </div>
      </div>
      ${renderRiskList("已超时", dashboard.overdueTasks, "danger")}
      ${renderRiskList("今日截止", dashboard.todayTasks, "warning")}
      ${renderRiskList("待审核", dashboard.reviewTasks, "review")}
    </aside>
    <aside class="panel overview-side">
      <div class="section-head">
        <div>
          <p class="eyebrow">Service</p>
          <h2>客服录单</h2>
        </div>
      </div>
      <div class="overview-list">
        ${dashboard.serviceRows.map(renderServiceLoadRow).join("") || '<div class="empty small-empty">暂无客服账号</div>'}
      </div>
      <div class="overview-actions">
        <button class="button" type="button" data-overview-view="designer">查看设计师视图</button>
        <button class="button secondary" type="button" data-overview-view="service">查看客服视图</button>
      </div>
    </aside>
  `;
  bindOverviewEvents();
}

function buildDashboard(tasks) {
  const designers = state.users.filter((user) => user.role === "designer");
  const services = state.users.filter((user) => user.role === "service");
  return {
    designerRows: designers.map((user) => {
      const assigned = tasks.filter((task) => task.assigneeId === user.id && task.visibility !== "private");
      const privateTasks = tasks.filter((task) => task.assigneeId === user.id && task.visibility === "private");
      return {
        user,
        assigned,
        privateTasks,
        active: assigned.filter((task) => !["done", "blocked"].includes(task.status)).length,
        urgent: assigned.filter((task) => task.priority === "urgent" && task.status !== "done").length,
        overdue: assigned.filter(isOverdue).length,
        review: assigned.filter((task) => task.status === "review").length,
      };
    }).sort((a, b) => b.active - a.active || b.urgent - a.urgent || b.overdue - a.overdue),
    serviceRows: services.map((user) => {
      const created = tasks.filter((task) => task.creatorId === user.id && task.visibility !== "private");
      return {
        user,
        created,
        active: created.filter((task) => !["done", "blocked"].includes(task.status)).length,
        urgent: created.filter((task) => task.priority === "urgent" && task.status !== "done").length,
        overdue: created.filter(isOverdue).length,
      };
    }).sort((a, b) => b.created.length - a.created.length),
    overdueTasks: tasks.filter(isOverdue).sort((a, b) => dueTime(a) - dueTime(b)).slice(0, 6),
    todayTasks: tasks.filter(isDueToday).sort((a, b) => (a.priority === "urgent" ? -1 : 1)).slice(0, 6),
    reviewTasks: tasks.filter((task) => task.status === "review").sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 6),
  };
}

function renderDesignerLoadCard(row) {
  const total = row.assigned.length;
  const done = row.assigned.filter((task) => task.status === "done").length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return `
    <article class="load-card ${row.overdue ? "danger" : row.urgent ? "warning" : ""}">
      <div class="load-head">
        <div>
          <strong>${escapeHtml(row.user.name)}</strong>
          <span>${escapeHtml(row.user.username)}</span>
        </div>
        <b>${row.active}</b>
      </div>
      <div class="load-stats">
        <span>公共 ${total}</span>
        <span>个人 ${row.privateTasks.length}</span>
        <span>加急 ${row.urgent}</span>
        <span>超时 ${row.overdue}</span>
        <span>待审 ${row.review}</span>
      </div>
      <div class="progress-line" style="--progress:${percent}%"><span></span></div>
    </article>
  `;
}

function renderServiceLoadRow(row) {
  return `
    <article class="overview-row">
      <div>
        <strong>${escapeHtml(row.user.name)}</strong>
        <span>创建 ${row.created.length}，进行 ${row.active}，加急 ${row.urgent}，超时 ${row.overdue}</span>
      </div>
      <b>${row.created.length}</b>
    </article>
  `;
}

function renderRiskList(title, tasks, tone) {
  return `
    <section class="risk-block ${tone}">
      <div class="risk-head">
        <strong>${title}</strong>
        <span>${tasks.length}</span>
      </div>
      <div class="overview-list">
        ${tasks.length ? tasks.map(renderRiskTask).join("") : '<div class="empty small-empty">暂无任务</div>'}
      </div>
    </section>
  `;
}

function renderRiskTask(task) {
  return `
    <button class="overview-task" type="button" data-overview-task="${task.id}">
      <strong>${escapeHtml(task.title)}</strong>
      <span>${escapeHtml(task.assigneeName || "未分配")} · ${task.dueDate || "未设截止"} · ${priorityLabels[task.priority] || task.priority}</span>
    </button>
  `;
}

function bindOverviewEvents() {
  workspace.querySelectorAll("[data-overview-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.adminView = "designer";
      state.selectedTaskId = button.dataset.overviewTask;
      adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item.dataset.adminView === "designer"));
      await loadPersonalNotes(state.selectedTaskId);
      render();
    });
  });
  workspace.querySelectorAll("[data-overview-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.adminView = button.dataset.overviewView;
      state.selectedTaskId = null;
      adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item.dataset.adminView === state.adminView));
      await loadData();
      render();
    });
  });
}
