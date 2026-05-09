function userCanCreatePublicTask() {
  return userHasPermission("tasks.create_public");
}

function userCanCreatePersonalTask() {
  return userHasPermission("tasks.create_private");
}

function canOpenAdminTaskCreateModal() {
  return userCanCreatePublicTask() || userCanCreatePersonalTask();
}

function availableTaskCreateModes() {
  return [
    userCanCreatePublicTask() ? { value: "public", title: "创建公共任务", hint: "派单给设计师，进入公共任务池。" } : null,
    userCanCreatePersonalTask() ? { value: "private", title: "创建个人任务", hint: "只记录给自己处理的个人事项。" } : null,
  ].filter(Boolean);
}

function defaultTaskCreateMode() {
  const modes = availableTaskCreateModes();
  return modes.length === 1 ? modes[0].value : "";
}

function mountAdminTaskCreateEntry(view) {
  if (!canOpenAdminTaskCreateModal()) return;
  const actions = resolveTaskCreateActions(view);
  if (!actions || actions.querySelector("#openAdminTaskCreateModal")) return;

  actions.insertAdjacentHTML("afterbegin", '<button class="button" id="openAdminTaskCreateModal" type="button">创建任务</button>');
  actions.querySelector("#openAdminTaskCreateModal").addEventListener("click", openAdminTaskCreateModal);
}

function resolveTaskCreateActions(view) {
  if (view === "overview") {
    const head = workspace.querySelector(".overview-main > .section-head");
    if (!head) return null;
    let actions = head.querySelector(".section-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "section-actions";
      head.appendChild(actions);
    }
    return actions;
  }
  if (view === "designer") {
    return workspace.querySelector(".panel > .section-head .section-actions");
  }
  if (view === "service") {
    return workspace.querySelector(".task-create-entry .section-actions");
  }
  return null;
}

function openAdminTaskCreateModal() {
  state.adminTaskCreateModalOpen = true;
  state.taskCreateMode = defaultTaskCreateMode();
  render();
}

function renderAdminTaskCreateModal() {
  if (!state.adminTaskCreateModalOpen || !canOpenAdminTaskCreateModal()) return "";
  const mode = state.taskCreateMode;
  const modes = availableTaskCreateModes();
  const title = mode === "public" ? "创建公共任务" : mode === "private" ? "创建个人任务" : "选择创建类型";
  return `
    <div class="modal-backdrop" id="adminTaskCreateBackdrop">
      <section class="modal-card task-create-modal-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">New Task</p>
            <h2>${title}</h2>
          </div>
          <button class="button secondary" id="closeAdminTaskCreateModal" type="button">关闭</button>
        </div>
        ${mode ? renderSelectedTaskCreateForm(mode, modes.length > 1) : renderTaskCreateModePicker(modes)}
      </section>
    </div>
  `;
}

function renderTaskCreateModePicker(modes) {
  return `
    ${renderTaskCreateModePickerStyles()}
    <form class="form task-create-mode-form" id="taskCreateModeForm">
      <p class="task-create-mode-hint">当前账号同时拥有创建公共任务和个人任务的权限，请先选择创建类型。</p>
      <div class="task-create-mode-grid">
        ${modes.map((mode, index) => `
          <label class="task-create-mode-card">
            <input type="radio" name="taskCreateMode" value="${mode.value}" ${index === 0 ? "checked" : ""} />
            <span class="task-create-mode-card-inner">
              <span class="task-create-mode-text">
                <span class="task-create-mode-title">${mode.title}</span>
                <span class="task-create-mode-desc">${mode.hint}</span>
              </span>
              <span class="task-create-mode-dot" aria-hidden="true"></span>
            </span>
          </label>
        `).join("")}
      </div>
      <button type="submit">确认选择</button>
    </form>
  `;
}

function renderTaskCreateModePickerStyles() {
  return `
    <style>
      .task-create-modal-card {
        width: min(760px, calc(100vw - 32px));
      }
      .task-create-mode-form {
        gap: 12px;
      }
      .task-create-mode-hint {
        margin: -2px 0 2px;
        color: var(--muted);
        font-size: 0.9rem;
        line-height: 1.6;
      }
      .task-create-mode-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .task-create-mode-card {
        display: block;
        min-width: 0;
        cursor: pointer;
      }
      .task-create-mode-card input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .task-create-mode-card-inner {
        min-height: 116px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff;
        transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
      }
      .task-create-mode-card:hover .task-create-mode-card-inner {
        border-color: rgba(47, 111, 221, 0.45);
        box-shadow: 0 10px 26px rgba(36, 46, 61, 0.08);
      }
      .task-create-mode-card input:checked + .task-create-mode-card-inner {
        border-color: var(--blue);
        background: #f7faff;
        box-shadow: inset 0 0 0 3px rgba(47, 111, 221, 0.14);
      }
      .task-create-mode-text {
        display: grid;
        gap: 8px;
      }
      .task-create-mode-title {
        color: var(--ink);
        font-weight: 900;
        font-size: 1rem;
      }
      .task-create-mode-desc {
        color: var(--muted);
        font-size: 0.9rem;
        line-height: 1.55;
      }
      .task-create-mode-dot {
        width: 26px;
        height: 26px;
        flex: 0 0 26px;
        display: inline-grid;
        place-items: center;
        border: 2px solid #b9c5d6;
        border-radius: 999px;
        background: #fff;
      }
      .task-create-mode-card input:checked + .task-create-mode-card-inner .task-create-mode-dot {
        border-color: var(--blue);
      }
      .task-create-mode-card input:checked + .task-create-mode-card-inner .task-create-mode-dot::after {
        content: "";
        width: 14px;
        height: 14px;
        border-radius: inherit;
        background: var(--blue);
      }
      @media (max-width: 680px) {
        .task-create-mode-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}

function renderSelectedTaskCreateForm(mode, canBack) {
  const formHtml = mode === "private" ? renderPersonalTaskForm({ formId: "taskForm", messageId: "taskMessage" }) : renderTaskForm({ mode: "public" });
  const backButton = canBack ? '<button class="button secondary" id="backTaskCreateMode" type="button">重新选择类型</button>' : "";
  return `
    ${backButton ? `<div class="section-actions" style="justify-content:flex-start;margin-bottom:12px;">${backButton}</div>` : ""}
    ${formHtml}
  `;
}

function bindAdminTaskCreateModal() {
  if (!state.adminTaskCreateModalOpen || !canOpenAdminTaskCreateModal()) return;

  document.querySelector("#closeAdminTaskCreateModal")?.addEventListener("click", closeAdminTaskCreateModal);
  document.querySelector("#adminTaskCreateBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "adminTaskCreateBackdrop") return;
    closeAdminTaskCreateModal();
  });
  document.querySelector("#taskCreateModeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.taskCreateMode = form.get("taskCreateMode") || defaultTaskCreateMode();
    render();
  });
  document.querySelector("#backTaskCreateMode")?.addEventListener("click", () => {
    state.taskCreateMode = "";
    render();
  });

  bindTaskForm({
    afterSuccess: () => {
      const createdMode = state.taskCreateMode;
      state.adminTaskCreateModalOpen = false;
      state.taskCreateMode = "";
      if (currentView() === "overview") openOverviewPanel("globalTasks");
      if (currentView() === "designer" && createdMode === "private") state.designerView = "private";
    },
  });
}

function closeAdminTaskCreateModal() {
  state.adminTaskCreateModalOpen = false;
  state.taskCreateMode = "";
  render();
}
