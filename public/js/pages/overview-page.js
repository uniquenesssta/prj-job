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
      <div class="overview-entry-grid compact-overview-entry-grid">
        ${renderOverviewEntry("teamLoad", "团队负载", dashboard.designerRows.length + dashboard.serviceRows.length, "设计师压力与客服接单情况")}
        ${renderOverviewEntry("globalTasks", "全局任务池", tasks.length, "筛选全部公共和个人任务")}
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
    case "globalTasks":
      return renderOverviewGlobalTasksPanel(tasks);
    case "teamLoad":
      return renderOverviewTeamLoadPanel(dashboard);
    case "designerTasks":
      return renderOverviewDesignerTasksPanel(tasks);
    case "serviceTasks":
      return renderOverviewServiceTasksPanel(tasks);
    default:
      return '<div class="overview-empty-hint">选择上方模块，在当前页展开处理。</div>';
  }
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
      <section class="load-section">
        <div class="load-section-head">
          <strong>设计师执行负载</strong>
          <span>${dashboard.designerRows.length}</span>
        </div>
        <div class="overview-grid load-grid">
          ${dashboard.designerRows.map(renderDesignerLoadCard).join("") || '<div class="empty small-empty">暂无设计师负载数据</div>'}
        </div>
      </section>
      <section class="load-section">
        <div class="load-section-head">
          <strong>客服接单负载</strong>
          <span>${dashboard.serviceRows.length}</span>
        </div>
        <div class="overview-grid service-load-grid">
          ${dashboard.serviceRows.map(renderServiceLoadCard).join("") || '<div class="empty small-empty">暂无客服账号</div>'}
        </div>
      </section>
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

function renderOverviewServiceTasksPanel(tasks) {
  const service = state.users.find((user) => user.id === state.selectedServiceId);
  const filtered = filterOverviewTasks(tasks.filter((task) => task.creatorId === state.selectedServiceId && task.visibility !== "private"));
  return `
    <section class="overview-expanded">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Service Tasks</p>
          <h2>${service ? escapeHtml(service.name) : "客服"} 发布的任务</h2>
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
  const tone = row.overdue ? "danger" : row.urgent ? "warning" : "";
  const selected = state.overviewExpandedPanel === "designerTasks" && state.selectedDesignerId === row.user.id ? "selected" : "";
  return `
    <button class="load-card ${tone} ${selected}" type="button" data-designer-id="${row.user.id}">
      <div class="load-head">
        <div>
          <strong>${escapeHtml(row.user.name)}</strong>
          <span>${escapeHtml(row.user.username)}</span>
        </div>
        <span class="load-total">
          <b>${row.active}</b>
          <small>进行压力</small>
        </span>
      </div>
      ${renderLoadNumberGrid(row)}
      <div class="progress-line" style="--progress:${percent}%"><span></span></div>
    </button>
  `;
}

function renderLoadNumberGrid(row) {
  const items = [
    ["公共", row.assigned.length, "load-public"],
    ["个人", row.privateTasks.length, "load-private"],
    ["加急", row.urgent, "load-urgent"],
    ["超时", row.overdue, "load-overdue"],
    ["待审", row.review, "load-review"],
    ["进行", row.doing, "load-doing"],
    ["完成", row.done, "load-done"],
    ["待办", row.todo, "load-todo"],
  ];
  return `
    <div class="load-number-grid">
      ${items.map(([label, value, className]) => `
        <span class="load-number ${className}">
          <b>${value}</b>
          <small>${label}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function renderServiceLoadCard(row) {
  const tone = row.overdue ? "danger" : row.urgent ? "warning" : "";
  const selected = state.overviewExpandedPanel === "serviceTasks" && state.selectedServiceId === row.user.id ? "selected" : "";
  return `
    <button class="load-card service-load-card ${tone} ${selected}" type="button" data-service-id="${row.user.id}">
      <div class="load-head">
        <div>
          <strong>${escapeHtml(row.user.name)}</strong>
          <span>${escapeHtml(row.user.username)}</span>
        </div>
        <span class="load-total">
          <b>${row.created.length}</b>
          <small>接单数量</small>
        </span>
      </div>
      <div class="load-number-grid service-load-numbers">
        <span class="load-number load-public"><b>${row.created.length}</b><small>接单</small></span>
        <span class="load-number load-doing"><b>${row.active}</b><small>进行中</small></span>
        <span class="load-number load-overdue"><b>${row.overdue}</b><small>超时</small></span>
        <span class="load-number load-urgent"><b>${row.urgent}</b><small>加急</small></span>
      </div>
    </button>
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
      toggleOverviewPanel(button.dataset.overviewPanel);
      render();
    });
  });
  workspace.querySelectorAll("[data-designer-id]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleOverviewDesignerPanel(button.dataset.designerId);
      render();
    });
  });
  workspace.querySelectorAll("[data-service-id]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleOverviewServicePanel(button.dataset.serviceId);
      render();
    });
  });
  workspace.querySelectorAll("[data-overview-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      openOverviewPanel("globalTasks");
      state.selectedTaskId = button.dataset.overviewTask;
      state.taskDetailModalOpen = true;
      await loadPersonalNotes(state.selectedTaskId);
      render();
    });
  });
  workspace.querySelector("#taskList")?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("button[data-delete-task-id]");
    if (deleteButton) {
      await deleteTask(deleteButton.dataset.deleteTaskId);
      return;
    }
    const button = event.target.closest("button[data-task-id]");
    if (!button) return;
    state.selectedTaskId = button.dataset.taskId;
    state.taskDetailModalOpen = true;
    await loadPersonalNotes(state.selectedTaskId);
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
