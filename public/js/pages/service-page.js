function renderServicePage() {
  const tasks = filteredTasks("service");
  workspace.className = `${state.user.role === "owner" ? "workspace admin-service" : "workspace service"} ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <aside class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">New Order</p>
          <h2>新建任务</h2>
        </div>
      </div>
      ${renderTaskForm()}
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
  bindTaskForm();
  bindTaskPageEvents();
}
