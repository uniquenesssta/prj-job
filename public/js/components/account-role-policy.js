function mountAccountRolePolicy(view) {
  if (view !== "account") return;
  patchAccountRoleEntries();
  patchDepartmentOptions();
  enhanceAccountRows();
  enhanceAccountRoleForm();
}

function patchAccountRoleEntries() {
  window.accountRoleEntries = function accountRoleEntries() {
    return [
      ["designer", roleLabels.designer || "设计师"],
      ["service", roleLabels.service || "客服"],
      ["custom", roleLabels.custom || "自定义"],
    ];
  };
}

function patchDepartmentOptions() {
  window.departmentOptions = function departmentOptions(selectedId) {
    const empty = `<option value="" ${!selectedId ? "selected" : ""}>不选择部门</option>`;
    return empty + state.departments
      .filter((dept) => !dept.disabledAt || dept.id === selectedId)
      .map((dept) => `<option value="${dept.id}" ${selectedId === dept.id ? "selected" : ""}>${escapeHtml(dept.name)}</option>`)
      .join("");
  };
}

function enhanceAccountRows() {
  const list = document.querySelector(".account-list");
  if (!list) return;
  document.querySelectorAll(".account-row").forEach((row) => {
    const button = row.querySelector("button[data-user-id]");
    const user = state.users.find((item) => item.id === button?.dataset.userId);
    if (!user) return;
    const badge = row.querySelector(".account-badge");
    if (badge && user.role === "custom") badge.textContent = user.customRoleName || "自定义";
    if (badge && user.role === "owner" && user.username !== "admin") badge.textContent = "历史管理员";
    const actions = row.querySelector(".account-actions");
    if (!actions) return;
    if (user.username === "admin") {
      actions.querySelector('button[data-account-action="permissions"]')?.remove();
      actions.querySelector('button[data-account-action="toggle"]')?.remove();
      return;
    }
    if (state.user?.username !== "admin" || actions.querySelector('button[data-account-action="delete-hard"]')) return;
    actions.insertAdjacentHTML("beforeend", `<button type="button" data-account-action="delete-hard" data-user-id="${user.id}">删除</button>`);
  });
  if (list.dataset.adminDeleteBound === "1") return;
  list.dataset.adminDeleteBound = "1";
  list.addEventListener("click", async (event) => {
    const button = event.target.closest('button[data-account-action="delete-hard"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const user = state.users.find((item) => item.id === button.dataset.userId);
    if (!user) return;
    const confirmed = window.confirm(`确认彻底删除账号“${user.name} / ${user.username}”？\n这是完全删除，不是禁用，无法在账号列表中恢复。`);
    if (!confirmed) return;
    await api(`/api/users/${user.id}`, { method: "DELETE" });
    const usersData = await api("/api/users");
    state.users = usersData.users;
    hydrateAssigneeFilter();
    render();
  }, true);
}

function enhanceAccountRoleForm() {
  const form = document.querySelector("#accountModalForm");
  if (!form || form.dataset.rolePolicyEnhanced === "1") return;
  form.dataset.rolePolicyEnhanced = "1";
  const editingUser = state.users.find((item) => item.id === state.accountEditingUserId) || null;
  const roleSelect = form.querySelector('select[name="role"]');
  const departmentSelect = form.querySelector('select[name="departmentId"]');
  const statusSelect = form.querySelector('select[name="disabled"]');
  const nameInput = form.querySelector('input[name="name"]');
  const usernameInput = form.querySelector('input[name="username"]');

  if (departmentSelect) departmentSelect.innerHTML = departmentOptions(editingUser?.departmentId || "");

  if (editingUser?.username === "admin") {
    if (roleSelect) {
      roleSelect.innerHTML = '<option value="owner" selected>最高管理员</option>';
      roleSelect.disabled = true;
    }
    nameInput?.setAttribute("disabled", "disabled");
    usernameInput?.setAttribute("disabled", "disabled");
    departmentSelect?.setAttribute("disabled", "disabled");
    statusSelect?.setAttribute("disabled", "disabled");
    const message = document.querySelector("#accountModalMessage");
    if (message) message.textContent = "最高管理员 admin 不可改名、不可改角色、不可禁用、不可删除，只允许修改密码。";
    return;
  }

  if (roleSelect) {
    const currentRole = editingUser?.role === "owner" ? "custom" : roleSelect.value;
    roleSelect.innerHTML = [
      `<option value="designer" ${currentRole === "designer" ? "selected" : ""}>${roleLabels.designer || "设计师"}</option>`,
      `<option value="service" ${currentRole === "service" ? "selected" : ""}>${roleLabels.service || "客服"}</option>`,
      `<option value="custom" ${currentRole === "custom" ? "selected" : ""}>${roleLabels.custom || "自定义"}</option>`,
    ].join("");
    if (!document.querySelector("#accountCustomRoleField")) {
      const customRoleName = editingUser?.customRoleName || (editingUser?.role === "owner" ? "历史管理员" : "");
      roleSelect.closest("label")?.insertAdjacentHTML(
        "afterend",
        `<label class="account-custom-role-field" id="accountCustomRoleField"><span>自定义角色名称</span><input name="customRoleName" value="${escapeAttr(customRoleName)}" placeholder="例如：运营、审核、主管" maxlength="24" /></label>`
      );
    }
    roleSelect.addEventListener("change", syncAccountCustomRoleField);
    syncAccountCustomRoleField();
  }

  form.addEventListener("submit", () => {
    if (nameInput?.disabled) nameInput.disabled = false;
    if (usernameInput?.disabled) usernameInput.disabled = false;
    if (roleSelect?.disabled) roleSelect.disabled = false;
    if (departmentSelect?.disabled) departmentSelect.disabled = false;
    if (statusSelect?.disabled) statusSelect.disabled = false;
  }, true);
}

function syncAccountCustomRoleField() {
  const roleSelect = document.querySelector('#accountModalForm select[name="role"]');
  const field = document.querySelector("#accountCustomRoleField");
  const input = field?.querySelector('input[name="customRoleName"]');
  if (!roleSelect || !field || !input) return;
  const isCustom = roleSelect.value === "custom";
  field.style.display = isCustom ? "" : "none";
  input.required = isCustom;
  if (!isCustom) input.value = "";
}
