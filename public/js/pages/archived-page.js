function renderArchivedPage() {
  const tasks = filteredTasks("archived");
  workspace.className = `workspace admin-designer ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Archived Tasks</p>
          <h2>归档项目</h2>
        </div>
        <button class="button secondary" id="refreshTasks" type="button">刷新</button>
      </div>
      ${renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
  `;
  bindTaskPageEvents();
}
