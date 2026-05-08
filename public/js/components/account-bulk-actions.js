function accountBulkSelectedIds() {
  if (!Array.isArray(state.accountSelectedUserIds)) state.accountSelectedUserIds = [];
  return state.accountSelectedUserIds;
}

function accountBulkVisibleUsers() {
  return typeof filteredAccountUsers === "function" ? filteredAccountUsers() : [];
}

function mountAccountBulkActions(view) {
  if (view !== "account" || !userHasPermission("users.manage")) return;
  accountBulkEnsureState();
  accountBulkInjectToolbar();
  accountBulkInjectRowSelectors();
  bindAccountBulkEvents();
}

function accountBulkEnsureState() {
  if (!Array.isArray(state.accountSelectedUserIds)) state.accountSelectedUserIds = [];
  if (state.accountBulkRole === undefined) state.accountBulkRole = "";
  if (state.accountBulkDepartmentId === undefined) state.accountBulkDepartmentId = "";
}

function accountBulkInjectToolbar() {
  const toolbar = document.querySelector(".account-toolbar");
  if (!toolbar || document.querySelector("#accountBulkActions")) return;
  toolbar.insertAdjacentHTML("afterend", renderAccountBulkActions());
}

function renderAccountBulkActions() {
  const selectedCount = accountBulkSelectedIds().length;
  return `
    <div class="account-bulk-actions" id="accountBulkActions">
      <label class="account-bulk-check">
        <span>批量选择</span>
        <div>
          <input id="accountBulkSelectAll" type="checkbox" ${accountBulkAllVisibleSelected() ? "checked" : ""} />
          <strong>已选 ${selectedCount} 个账号</strong>
        </div>
      </label>
      <label class="account-bulk-field">
        <span>批量角色</span>
        <select id="accountBulkRoleSelect">
          <option value="">不调整角色</option>
          ${accountRoleEntries().map(([role, label]) => `<option value="${role}" ${state.accountBulkRole === role ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <label class="account-bulk-field">
        <span>批量部门</span>
        <select id="accountBulkDepartmentSelect">
          <option value="">不调整部门</option>
          ${state.departments.filter((dept) => !dept.disabledAt).map((dept) => `<option value="${dept.id}" ${state.accountBulkDepartmentId === dept.id ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}
        </select>
      </label>
      <div class="account-bulk-buttons">
        <button class="button secondary" id="accountBulkEnable" type="button" ${selectedCount ? "" : "disabled"}>批量启用</button>
        <button class="button secondary" id="accountBulkDisable" type="button" ${selectedCount ? "" : "disabled"}>批量禁用</button>
        <button class="button secondary" id="accountBulkApply" type="button" ${selectedCount ? "" : "disabled"}>应用角色/部门</button>
        <button class="button secondary" id="accountBulkExport" type="button" ${selectedCount ? "" : "disabled"}>导出账号</button>
      </div>
    </div>
  `;
}

function accountBulkInjectRowSelectors() {
  document.querySelectorAll(".account-row").forEach((row) => {
    const userId = row.querySelector("button[data-user-id]")?.dataset.userId;
    if (!userId || row.querySelector(".account-bulk-row-check")) return;
    row.classList.add("account-row-with-select");
    row.insertAdjacentHTML(
      "afterbegin",
      `<label class="account-bulk-row-check" title="选择账号"><input type="checkbox" data-account-select="${userId}" ${accountBulkSelectedIds().includes(userId) ? "checked" : ""} /></label>`
    );
  });
}

function bindAccountBulkEvents() {
  document.querySelector("#accountBulkSelectAll")?.addEventListener("change", (event) => {
    const visibleIds = accountBulkVisibleUsers().map((user) => user.id);
    state.accountSelectedUserIds = event.currentTarget.checked ? visibleIds : [];
    render();
  });

  document.querySelectorAll("input[data-account-select]").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = new Set(accountBulkSelectedIds());
      if (input.checked) selected.add(input.dataset.accountSelect);
      else selected.delete(input.dataset.accountSelect);
      state.accountSelectedUserIds = [...selected];
      render();
    });
  });

  document.querySelector("#accountBulkRoleSelect")?.addEventListener("change", (event) => {
    state.accountBulkRole = event.currentTarget.value;
  });

  document.querySelector("#accountBulkDepartmentSelect")?.addEventListener("change", (event) => {
    state.accountBulkDepartmentId = event.currentTarget.value;
  });

  document.querySelector("#accountBulkEnable")?.addEventListener("click", () => accountBulkUpdate({ disabled: "false" }, "批量启用"));
  document.querySelector("#accountBulkDisable")?.addEventListener("click", () => accountBulkUpdate({ disabled: "true" }, "批量禁用"));
  document.querySelector("#accountBulkApply")?.addEventListener("click", accountBulkApplyRoleDepartment);
  document.querySelector("#accountBulkExport")?.addEventListener("click", accountBulkExportSelected);
}

function accountBulkAllVisibleSelected() {
  const visibleIds = accountBulkVisibleUsers().map((user) => user.id);
  return visibleIds.length > 0 && visibleIds.every((id) => accountBulkSelectedIds().includes(id));
}

async function accountBulkApplyRoleDepartment() {
  const body = {};
  if (state.accountBulkRole) body.role = state.accountBulkRole;
  if (state.accountBulkDepartmentId) body.departmentId = state.accountBulkDepartmentId;
  if (!Object.keys(body).length) {
    window.alert("请先选择要批量调整的角色或部门。");
    return;
  }
  await accountBulkUpdate(body, "批量调整角色/部门");
}

async function accountBulkUpdate(body, actionName) {
  const ids = accountBulkSelectedIds();
  if (!ids.length) return;
  const confirmed = window.confirm(`确认对 ${ids.length} 个账号执行“${actionName}”？`);
  if (!confirmed) return;
  for (const userId of ids) {
    await api(`/api/users/${userId}`, { method: "PATCH", body });
  }
  const usersData = await api("/api/users");
  state.users = usersData.users;
  state.accountSelectedUserIds = [];
  state.accountBulkRole = "";
  state.accountBulkDepartmentId = "";
  hydrateAssigneeFilter();
  render();
}

function accountBulkExportSelected() {
  const selected = new Set(accountBulkSelectedIds());
  const users = state.users.filter((user) => selected.has(user.id));
  if (!users.length) return;
  const header = ["姓名", "账号", "角色", "部门", "状态", "是否有自定义权限"];
  const rows = users.map((user) => [
    user.name,
    user.username,
    roleLabels[user.role] || user.role,
    departmentName(user.departmentId),
    user.disabledAt ? "禁用" : "启用",
    hasCustomPermission(user) ? "是" : "否",
  ]);
  downloadCsv("accounts-export.csv", [header, ...rows]);
}

function hasCustomPermission(user) {
  try {
    const parsed = JSON.parse(user.customPermissions || "{}");
    return Boolean(parsed.extra?.length || parsed.disabled?.length);
  } catch {
    return false;
  }
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
