function canOpenAdminTaskCreateModal() {
  return state.user?.role === "owner" && userHasPermission("tasks.create_public");
}

function mountAdminTaskCreateEntry(view) {
  if (view !== "overview" || !canOpenAdminTaskCreateModal()) return;
  const head = workspace.querySelector(".overview-main > .section-head");
  if (!head || head.querySelector("#openAdminTaskCreateModal")) return;

  const actions = document.createElement("div");
  actions.className = "section-actions";
  actions.innerHTML = '<button class="button" id="openAdminTaskCreateModal" type="button">新建任务</button>';
  head.appendChild(actions);

  actions.querySelector("#openAdminTaskCreateModal").addEventListener("click", () => {
    state.adminTaskCreateModalOpen = true;
    render();
  });
}

function renderAdminTaskCreateModal() {
  if (!state.adminTaskCreateModalOpen || !canOpenAdminTaskCreateModal()) return "";
  return `
    <div class="modal-backdrop" id="adminTaskCreateBackdrop">
      <section class="modal-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">New Order</p>
            <h2>管理员新建任务</h2>
          </div>
          <button class="button secondary" id="closeAdminTaskCreateModal" type="button">关闭</button>
        </div>
        ${renderTaskForm()}
      </section>
    </div>
  `;
}

function bindAdminTaskCreateModal() {
  if (!state.adminTaskCreateModalOpen || !canOpenAdminTaskCreateModal()) return;

  document.querySelector("#closeAdminTaskCreateModal")?.addEventListener("click", closeAdminTaskCreateModal);
  document.querySelector("#adminTaskCreateBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "adminTaskCreateBackdrop") return;
    closeAdminTaskCreateModal();
  });

  bindTaskForm({
    afterSuccess: () => {
      state.adminTaskCreateModalOpen = false;
      openOverviewPanel("globalTasks");
    },
  });
}

function closeAdminTaskCreateModal() {
  state.adminTaskCreateModalOpen = false;
  render();
}
