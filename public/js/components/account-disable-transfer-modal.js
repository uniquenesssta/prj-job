function mountAccountDisableTransfer(view) {
  if (view !== "account" || !userHasPermission("users.manage")) return;
  interceptAccountDisableClicks();
  const modal = renderAccountDisableTransferModal();
  if (!modal) return;
  workspace.insertAdjacentHTML("beforeend", modal);
  bindAccountDisableTransferModal();
}

function interceptAccountDisableClicks() {
  const list = document.querySelector(".account-list");
  if (!list || list.dataset.disableTransferIntercepted === "1") return;
  list.dataset.disableTransferIntercepted = "1";
  list.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest('button[data-account-action="toggle"]');
      if (!button) return;
      const user = state.users.find((item) => item.id === button.dataset.userId);
      if (!user || user.disabledAt) return;
      if (!["designer", "service"].includes(user.role)) return;
      if (!accountDisableTransferActiveTasks(user).length) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openAccountDisableTransferModal(user);
    },
    true
  );
}

function accountDisableTransferActiveTasks(user) {
  if (!user) return [];
  const activeStatuses = new Set(["todo", "doing", "review", "blocked"]);
  return state.tasks.filter((task) => {
    if (!task || task.deletedAt || task.archivedAt || !activeStatuses.has(task.status)) return false;
    if (user.role === "designer") return task.assigneeId === user.id;
    if (user.role === "service") return task.creatorId === user.id && task.visibility !== "private";
    return false;
  });
}

function openAccountDisableTransferModal(user) {
  const tasks = accountDisableTransferActiveTasks(user);
  if (!tasks.length || !["designer", "service"].includes(user.role)) {
    saveAccount(user.id, { disabled: "true", disableTransferAction: "keep" });
    return;
  }
  state.accountDisableTransferUserId = user.id;
  state.accountDisableTransferAction = "keep";
  state.accountDisableTransferToUserId = "";
  render();
}

function renderAccountDisableTransferModal() {
  const user = state.users.find((item) => item.id === state.accountDisableTransferUserId);
  if (!user) return "";
  const tasks = accountDisableTransferActiveTasks(user);
  if (!tasks.length) return "";
  const isDesigner = user.role === "designer";
  const receiverRole = isDesigner ? "designer" : "service";
  const receiverLabel = isDesigner ? "设计师" : "客服";
  const candidates = state.users.filter((item) => item.role === receiverRole && item.id !== user.id && !item.disabledAt && !item.deletedAt);
  return `
    <div class="modal-backdrop" id="accountDisableTransferBackdrop">
      <form class="modal-card account-disable-transfer-card" id="accountDisableTransferForm">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Disable Account</p>
            <h2>禁用前处理责任转移</h2>
          </div>
          <button class="icon-button" id="closeAccountDisableTransferModal" type="button">×</button>
        </div>
        <div class="account-disable-warning">
          <strong>${escapeHtml(user.name)} 还有 ${tasks.length} 个未完成${isDesigner ? "设计任务" : "跟进任务"}</strong>
          <span>禁用账号后对方将不能登录，请选择这些任务后续如何处理。</span>
        </div>
        <div class="account-disable-options">
          <label class="account-disable-option">
            <input type="radio" name="disableTransferAction" value="keep" ${state.accountDisableTransferAction === "keep" ? "checked" : ""} />
            <span>${isDesigner ? "保持原负责人，但禁止登录" : "保持原客户跟进人，但禁止登录"}</span>
          </label>
          <label class="account-disable-option">
            <input type="radio" name="disableTransferAction" value="transfer" ${state.accountDisableTransferAction === "transfer" ? "checked" : ""} />
            <span>转移给其他${receiverLabel}</span>
          </label>
          ${isDesigner ? `
            <label class="account-disable-option">
              <input type="radio" name="disableTransferAction" value="unassign" ${state.accountDisableTransferAction === "unassign" ? "checked" : ""} />
              <span>批量改为待分配</span>
            </label>
          ` : ""}
        </div>
        <label class="account-disable-receiver" style="${state.accountDisableTransferAction === "transfer" ? "" : "display:none"}">
          <span>接收${receiverLabel}</span>
          <select name="transferToUserId">
            <option value="">请选择</option>
            ${candidates.map((item) => `<option value="${item.id}" ${state.accountDisableTransferToUserId === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.username)}</option>`).join("")}
          </select>
        </label>
        <div class="account-disable-task-list">
          ${tasks.slice(0, 6).map((task) => `
            <article>
              <strong>${escapeHtml(task.title)}</strong>
              <span>${statusLabels[task.status] || task.status} · ${task.dueDate || "未设截止"}</span>
            </article>
          `).join("")}
          ${tasks.length > 6 ? `<p>还有 ${tasks.length - 6} 个任务未显示。</p>` : ""}
        </div>
        <p class="message" id="accountDisableTransferMessage"></p>
        <div class="modal-actions">
          <button class="button secondary" id="cancelAccountDisableTransfer" type="button">取消</button>
          <button class="button danger" type="submit">确认禁用</button>
        </div>
      </form>
    </div>
  `;
}

function bindAccountDisableTransferModal() {
  const form = document.querySelector("#accountDisableTransferForm");
  if (!form) return;
  document.querySelector("#closeAccountDisableTransferModal")?.addEventListener("click", closeAccountDisableTransferModal);
  document.querySelector("#cancelAccountDisableTransfer")?.addEventListener("click", closeAccountDisableTransferModal);
  document.querySelector("#accountDisableTransferBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "accountDisableTransferBackdrop") return;
    closeAccountDisableTransferModal();
  });
  form.querySelectorAll('input[name="disableTransferAction"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.accountDisableTransferAction = input.value;
      render();
    });
  });
  form.querySelector('select[name="transferToUserId"]')?.addEventListener("change", (event) => {
    state.accountDisableTransferToUserId = event.currentTarget.value;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = state.users.find((item) => item.id === state.accountDisableTransferUserId);
    if (!user) return;
    const formData = new FormData(form);
    const action = formData.get("disableTransferAction") || "keep";
    const transferToUserId = formData.get("transferToUserId") || "";
    const message = document.querySelector("#accountDisableTransferMessage");
    if (action === "transfer" && !transferToUserId) {
      message.textContent = "请选择接收人。";
      return;
    }
    await saveAccount(user.id, {
      disabled: "true",
      disableTransferAction: action,
      transferToUserId,
    });
    closeAccountDisableTransferModal(false);
  });
}

function closeAccountDisableTransferModal(shouldRender = true) {
  state.accountDisableTransferUserId = "";
  state.accountDisableTransferAction = "keep";
  state.accountDisableTransferToUserId = "";
  if (shouldRender) render();
}
