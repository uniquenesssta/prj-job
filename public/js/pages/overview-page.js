function renderOverviewPage() {
  const tasks = state.tasks.filter((task) => !task.archivedAt);
  const dashboard = buildDashboard(tasks);
  workspace.className = "workspace overview overview-workspace";
  workspace.innerHTML = `
    <section class="panel overview-main">
      <div class="section-head">
        <div>
          <p class="eyebrow">Overview</p>
          <h2>管理总览</h2>
        </div>
      </div>
      <div class="overview-entry-grid">
        ${renderOverviewEntry("teamLoad", "团队负载", dashboard.designerRows.length, "查看设计师压力、超时和待审")}
        ${renderOverviewEntry("globalTasks", "全局任务池", tasks.length, "筛选全部公共和个人任务")}
        ${renderOverviewEntry("service", "客服录单", dashboard.serviceRows.reduce((sum, row) => sum + row.created.length, 0), "在当前页创建公共任务")}
        ${renderOverviewEntry("designer", "设计师视图", dashboard.designerRows.reduce((sum, row) => sum + row.active, 0), "查看每位设计师任务")}
      </div>
      ${renderOverviewExpandedPanel(dashboard, tasks)}
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
  `;
  bindOverviewEvents();
  if (state.overviewExpandedPanel === "service") bindOverviewTaskForm();
}

function renderOverviewEntry(panel, title, count, hint) {
  return `
    <button class="overview-entry ${state.overviewExpandedPanel === panel ? "active" : ""}" type="button" data-overview-panel="${panel}">
      <span>${title}</span>
      <strong>${count}</strong>
      <small>${hint}</small>
    </button>
  `;
}

function renderOverviewExpandedPanel(dashboard, tasks) {
  switch (state.overviewExpandedPanel) {
    case "service":
      return renderOverviewServicePanel();
    case "designer":
      return renderOverviewDesignerPanel(dashboard);
    case "globalTasks":
      return renderOverviewGlobalTasksPanel(tasks);
    case "teamLoad":
      return renderOverviewTeamLoadPanel(dashboard);
    case "designerTasks":
      return renderOverviewDesignerTasksPanel(tasks);
    default:
      return '<div class="overview-empty-hint">选择上方模块，在当前页展开处理。</div>';
  }
}

function renderOverviewServicePanel() {
  return `
    <section class="overview-expanded">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Service Form</p>
          <h2>客服录单</h2>
        </div>
      </div>
      ${renderTaskForm()}
    </section>
  `;
}

function renderOverviewDesignerPanel(dashboard) {
  return `
    <section class="overview-expanded">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Designers</p>
          <h2>设计师视图</h2>
        </div>
      </div>
      <div class="overview-grid">
        ${dashboard.designerRows.map(renderDesignerLoadCard).join("") || '<div class="empty small-empty">暂无设计师账号</div>'}
      </div>
    </section>
  `;
}

function renderOverviewTeamLoadPanel(dashboard) {
  return `
    <section class="overview-expanded">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Team Load</p>
          <h2>团队负载详情</h2>
        </div>
      </div>
      <div class="overview-grid">
        ${dashboard.designerRows.map(renderDesignerLoadCard).join("") || '<div class="empty small-empty">暂无负载数据</div>'}
      </div>
      <div class="overview-list">
        ${dashboard.serviceRows.map(renderServiceLoadRow).join("") || '<div class="empty small-empty">暂无客服账号</div>'}
      </div>
    </section>
  `;
}

function renderOverviewGlobalTasksPanel(tasks) {
  const filtered = filterOverviewTasks(tasks);
  return `
    <section class="overview-expanded">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Global Tasks</p>
          <h2>全局任务池</h2>
        </div>
      </div>
      ${renderOverviewTaskFilters()}
      ${renderTaskList(filtered)}
    </section>
  `;
}

function renderOverviewDesignerTasksPanel(tasks) {
  const designer = state.users.find((user) => user.id === state.selectedDesignerId);
  const filtered = filterOverviewTasks(tasks.filter((task) => task.assigneeId === state.selectedDesignerId));
  return `
    <section class="overview-expanded">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Designer Tasks</p>
          <h2>${designer ? escapeHtml(designer.name) : "设计师"} 的任务</h2>
        </div>
      </div>
      ${renderOverviewTaskFilters()}
      ${renderTaskList(filtered)}
    </section>
  `;
}

function renderOverviewTaskFilters() {
  const filters = [
    ["all", "全部"],
    ["public", "公共"],
    ["private", "个人"],
    ["urgent", "加急"],
    ["overdue", "超时"],
    ["review", "待审"],
    ["doing", "进行中"],
    ["done", "已完成"],
    ["todo", "待开始"],
  ];
  return `
    <div class="overview-task-tools">
      <div class="quick-filters">
        ${filters.map(([key, label]) => `<button class="${state.overviewTaskFilter === key ? "active" : ""}" type="button" data-overview-filter="${key}">${label}</button>`).join("")}
      </div>
      <label class="search-field">
        <span>搜索</span>
        <input id="overviewSearchInput" value="${escapeAttr(state.overviewSearch)}" placeholder="任务、微信、订单、设计师、客服" />
      </label>
    </div>
  `;
}

function filterOverviewTasks(tasks) {
  return tasks.filter((task) => {
    const filterOk = state.overviewTaskFilter === "all"
      || (state.overviewTaskFilter === "public" && task.visibility !== "private")
      || (state.overviewTaskFilter === "private" && task.visibility === "private")
      || (state.overviewTaskFilter === "urgent" && task.priority === "urgent")
      || (state.overviewTaskFilter === "overdue" && isOverdue(task))
      || task.status === state.overviewTaskFilter;
    const text = `${task.title} ${task.description} ${task.wechat} ${task.orderNo} ${task.taobaoId} ${task.assigneeName} ${task.creatorName}`.toLowerCase();
    const searchOk = !state.overviewSearch || text.includes(state.overviewSearch);
    return filterOk && searchOk;
  });
}

function buildDashboard(tasks) {
  const designers = state.users.filter((user) => user.role === "designer");
  const services = state.users.filter((user) => user.role === "service");
  return {
    designerRows: designers.map((user) => {
      const assigned = tasks.filter((task) => task.assigneeId === user.id && task.visibility !== "private");
      const privateTasks = tasks.filter((task) => task.assigneeId === user.id && task.visibility === "private");
      const allTasks = assigned.concat(privateTasks);
      return {
        user,
        assigned,
        privateTasks,
        allTasks,
        active: allTasks.filter((task) => !["done", "blocked"].includes(task.status)).length,
        urgent: allTasks.filter((task) => task.priority === "urgent" && task.status !== "done").length,
        overdue: allTasks.filter(isOverdue).length,
        review: allTasks.filter((task) => task.status === "review").length,
        doing: allTasks.filter((task) => task.status === "doing").length,
        done: allTasks.filter((task) => task.status === "done").length,
        todo: allTasks.filter((task) => task.status === "todo").length,
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
  const total = row.allTasks.length;
  const percent = total ? Math.round((row.done / total) * 100) : 0;
  return `
    <button class="load-card ${row.overdue ? "danger" : row.urgent ? "warning" : ""}" type="button" data-designer-id="${row.user.id}">
      <div class="load-head">
        <div>
          <strong>${escapeHtml(row.user.name)}</strong>
          <span>${escapeHtml(row.user.username)}</span>
        </div>
        <b>${row.active}</b>
      </div>
      <div class="load-stats">
        <span>公共 ${row.assigned.length}</span>
        <span>个人 ${row.privateTasks.length}</span>
        <span>加急 ${row.urgent}</span>
        <span>超时 ${row.overdue}</span>
        <span>待审 ${row.review}</span>
      </div>
      <div class="progress-line" style="--progress:${percent}%"><span></span></div>
    </button>
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
  workspace.querySelectorAll("[data-overview-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.overviewPanel;
      state.overviewExpandedPanel = state.overviewExpandedPanel === panel ? "" : panel;
      state.selectedDesignerId = "";
      state.overviewTaskFilter = "all";
      state.overviewSearch = "";
      render();
    });
  });
  workspace.querySelectorAll("[data-designer-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const designerId = button.dataset.designerId;
      if (state.overviewExpandedPanel === "designerTasks" && state.selectedDesignerId === designerId) {
        state.overviewExpandedPanel = "";
        state.selectedDesignerId = "";
      } else {
        state.overviewExpandedPanel = "designerTasks";
        state.selectedDesignerId = designerId;
      }
      state.overviewTaskFilter = "all";
      state.overviewSearch = "";
      render();
    });
  });
  workspace.querySelectorAll("[data-overview-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.overviewExpandedPanel = "globalTasks";
      state.selectedTaskId = button.dataset.overviewTask;
      await loadPersonalNotes(state.selectedTaskId);
      render();
    });
  });
  workspace.querySelector("#taskList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-task-id]");
    if (!button) return;
    state.selectedTaskId = button.dataset.taskId;
    await loadPersonalNotes(state.selectedTaskId);
    state.adminView = "designer";
    adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item.dataset.adminView === "designer"));
    render();
  });
  workspace.querySelectorAll("[data-overview-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.overviewTaskFilter = button.dataset.overviewFilter;
      render();
    });
  });
  workspace.querySelector("#overviewSearchInput")?.addEventListener("input", (event) => {
    state.overviewSearch = event.currentTarget.value.trim().toLowerCase();
    render();
  });
}

function bindOverviewTaskForm() {
  bindTaskForm();
}
