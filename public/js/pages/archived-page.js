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
        <div class="section-actions">
          <button class="button" id="archiveButton" type="button">归档全部已完成</button>
          <button class="button secondary" id="refreshTasks" type="button">刷新</button>
        </div>
      </div>
      <p class="message" id="archiveMessage"></p>
      ${renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
  `;
  bindTaskPageEvents();
  bindArchiveButton();
}
