function mountAccountRolePolicy(view) {
  if (view !== "account") return;
  patchAccountRoleEntries();
  patchDepartmentOptions();
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

function enhanceAccountRoleForm() {
  const form = document.querySelector("#accountModalForm");
  if (!form || form.dataset.rolePolicyEnhanced === "1") return;
  form.dataset.rolePolicyEnhanced = "1";
  const editingUser = state.users.find((item) => item.id === state.accountEditingUserId) || null;
  const roleSelect = form.querySelector('select[name="role"]');
  const departmentSelect = form.querySelector('select[name="departmentId"]');
  const statusSelect = form.querySelector('select[name="disabled"]');
  if (roleSelect && editingUser?.role === "owner") {
    roleSelect.innerHTML = '<option value="owner" selected>管理员</option>';
    roleSelect.disabled = true;
    form.querySelector('input[name="name"]')?.setAttribute("disabled", "disabled");
    form.querySelector('input[name="username"]')?.setAttribute("disabled", "disabled");
    departmentSelect?.setAttribute("disabled", "disabled");
    statusSelect?.setAttribute("disabled", "disabled");
    const message = document.querySelector("#accountModalMessage");
    if (message) message.textContent = "管理员账号不可改角色、部门和状态，只允许修改密码。";
    return;
  }
  if (roleSelect && !roleSelect.querySelector('option[value="custom"]')) {
    roleSelect.insertAdjacentHTML("beforeend", `<option value="custom">${roleLabels.custom || "自定义"}</option>`);
  }
  if (roleSelect) {
    roleSelect.querySelector('option[value="owner"]')?.remove();
    const customRoleName = editingUser?.customRoleName || "";
    roleSelect.closest("label")?.insertAdjacentHTML(
      "afterend",
      `<label class="account-custom-role-field" id="accountCustomRoleField" style="${roleSelect.value === "custom" ? "" : "display:none"}"><span>自定义角色名称</span><input name="customRoleName" value="${escapeAttr(customRoleName)}" placeholder="例如：运营、审核、主管" maxlength="24" ${roleSelect.value === "custom" ? "required" : ""} /></label>`
    );
    roleSelect.addEventListener("change", syncAccountCustomRoleField);
    syncAccountCustomRoleField();
  }
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
