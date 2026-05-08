function canUsePublicTaskCreateEntry() {
  return currentView() === "overview" && userHasPermission("tasks.create_public");
}

function renderPublicTaskCreateUi() {
  if (!canUsePublicTaskCreateEntry()) {
    state.publicTaskModalOpen = false;
    return;
  }
  mountPublicTaskCreateButton();
  const modal = renderPublicTaskModal();
  if (modal) workspace.insertAdjacentHTML("beforeend", modal);
}

function mountPublicTaskCreateButton() {
  const sectionHead = workspace.querySelector(".overview-main > .section-head");
  if (!sectionHead || sectionHead.querySelector("#openPublicTaskModal")) return;
  sectionHead.insertAdjacentHTML("beforeend", `
    <div class="section-actions">
      <button class="button" id="openPublicTaskModal" type="button">新建任务</button>
    </div>
  `);
}

function renderPublicTaskModal() {
  if (!state.publicTaskModalOpen) return "";
  return `
    <div class="modal-backdrop" id="publicTaskBackdrop">
      <section class="modal-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">New Order</p>
            <h2>新建任务</h2>
          </div>
          <button class="button secondary" id="closePublicTaskModal" type="button">关闭</button>
        </div>
        ${renderTaskForm()}
      </section>
    </div>
  `;
}

function bindPublicTaskCreateEvents() {
  document.querySelector("#openPublicTaskModal")?.addEventListener("click", () => {
    state.publicTaskModalOpen = true;
    render();
  });

  document.querySelector("#closePublicTaskModal")?.addEventListener("click", closePublicTaskModal);

  document.querySelector("#publicTaskBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "publicTaskBackdrop") return;
    closePublicTaskModal();
  });

  bindTaskForm({
    formSelector: "#publicTaskBackdrop #taskForm",
    messageSelector: "#publicTaskBackdrop #taskMessage",
    onSuccess: async () => {
      state.publicTaskModalOpen = false;
      openOverviewPanel("globalTasks");
      await loadData();
      render();
    },
  });
}

function closePublicTaskModal() {
  state.publicTaskModalOpen = false;
  render();
}
