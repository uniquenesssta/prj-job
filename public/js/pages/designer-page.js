function renderDesignerPage() {
  const tasks = filteredTasks("designer");
  workspace.className = `${state.user.role === "owner" ? "workspace admin-designer" : "workspace designer"} ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Design Tasks</p>
          <h2>任务池</h2>
        </div>
        <div class="section-actions">
          <button class="button secondary" id="refreshTasks" type="button">刷新</button>
        </div>
      </div>
      ${state.user.role === "designer" ? `
        <div class="sub-tabs" id="designerSubTabs">
          <button class="${state.designerView === "public" ? "active" : ""}" type="button" data-designer-view="public">公共任务</button>
          <button class="${state.designerView === "private" ? "active" : ""}" type="button" data-designer-view="private">我的个人任务</button>
        </div>
      ` : ""}
      ${state.user.role === "designer" ? renderGroupedTaskList(tasks) : renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
  `;
  bindTaskPageEvents();
  bindDesignerPageEvents();
}

function bindDesignerPageEvents() {
  document.querySelector("#designerSubTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-designer-view]");
    if (!button) return;
    state.designerView = button.dataset.designerView;
    state.selectedTaskId = null;
    state.pendingRemarkImages = [];
    render();
  });
}
