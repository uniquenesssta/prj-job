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
          ${state.user.role === "designer" ? '<button class="button" id="openPersonalTaskModal" type="button">新增个人任务</button>' : ""}
          <button class="button secondary" id="refreshTasks" type="button">刷新</button>
        </div>
      </div>
      ${state.user.role === "designer" ? `
        <div class="sub-tabs" id="designerSubTabs">
          <button class="${state.designerView === "public" ? "active" : ""}" type="button" data-designer-view="public">公共任务</button>
          <button class="${state.designerView === "private" ? "active" : ""}" type="button" data-designer-view="private">我的个人任务</button>
        </div>
      ` : ""}
      ${renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
    ${renderPersonalTaskModal()}
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
    render();
  });

  document.querySelector("#openPersonalTaskModal")?.addEventListener("click", () => {
    state.personalTaskModalOpen = true;
    render();
  });

  document.querySelector("#closePersonalTaskModal")?.addEventListener("click", () => {
    state.personalTaskModalOpen = false;
    render();
  });

  document.querySelector("#personalTaskBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "personalTaskBackdrop") return;
    state.personalTaskModalOpen = false;
    render();
  });

  document.querySelector("#personalTaskForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#personalTaskMessage");
    message.textContent = "";
    try {
      await api("/api/tasks", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
      state.personalTaskModalOpen = false;
      state.designerView = "private";
      await loadData();
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  });
}
