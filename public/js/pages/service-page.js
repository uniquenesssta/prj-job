function renderServicePage() {
  const tasks = filteredTasks("service");
  workspace.className = `${state.user.role === "owner" ? "workspace admin-service" : "workspace service"} ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <aside class="panel task-create-entry">
      <div class="section-head">
        <div>
          <p class="eyebrow">New Task</p>
          <h2>创建任务</h2>
        </div>
        <div class="section-actions"></div>
      </div>
      <p class="message" style="color: var(--muted); margin-top: 0;">有创建权限的账号会在这里显示统一创建入口。</p>
    </aside>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Customer Tasks</p>
          <h2>客服任务池</h2>
        </div>
        <button class="button secondary" id="refreshTasks" type="button">刷新</button>
      </div>
      ${renderTaskList(tasks)}
    </section>
  `;
  bindTaskPageEvents();
}
