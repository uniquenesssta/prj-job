function renderAccountManagementPage() {
  workspace.className = "workspace account account-workspace";
  const users = filteredAccountUsers();
  workspace.innerHTML = `
    <section class="panel account-panel">
      <div class="section-head account-head">
        <div>
          <p class="eyebrow">Accounts</p>
          <h2>账号管理</h2>
        </div>
        <div class="section-actions">
          <button class="button secondary" id="openDepartmentModal" type="button">部门管理</button>
          <button class="button" id="openCreateAccountModal" type="button">新增账号</button>
        </div>
      </div>
      <div class="account-toolbar">
        <label>
          <span>搜索账号</span>
          <input id="accountSearchInput" value="${escapeAttr(state.accountSearch)}" placeholder="姓名、账号、角色、部门" />
        </label>
        <label>
          <span>角色</span>
          <select id="accountRoleFilter">
            <option value="all">全部角色</option>
            ${Object.entries(roleLabels).map(([role, label]) => `<option value="${role}" ${state.accountRoleFilter === role ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>状态</span>
          <select id="accountStatusFilter">
            <option value="all" ${state.accountStatusFilter === "all" ? "selected" : ""}>全部状态</option>
            <option value="active" ${state.accountStatusFilter === "active" ? "selected" : ""}>启用</option>
            <option value="disabled" ${state.accountStatusFilter === "disabled" ? "selected" : ""}>禁用</option>
          </select>
        </label>
      </div>
      <div class="account-list">
        ${users.length ? users.map(renderAccountRow).join("") : '<div class="empty">没有匹配的账号</div>'}
      </div>
    </section>
    ${renderAccountModal()}
  `;
  bindAccountManagementEvents();
}

function filteredAccountUsers() {
  return state.users.filter((user) => {
    const statusOk = state.accountStatusFilter === "all"
      || (state.accountStatusFilter === "active" && !user.disabledAt)
      || (state.accountStatusFilter === "disabled" && user.disabledAt);
    const roleOk = state.accountRoleFilter === "all" || user.role === state.accountRoleFilter;
    const text = `${user.name} ${user.username} ${roleLabels[user.role] || ""} ${departmentName(user.departmentId)}`.toLowerCase();
    const searchOk = !state.accountSearch || text.includes(state.accountSearch);
    return statusOk && roleOk && searchOk;
  });
}

function renderAccountRow(user) {
  const disabled = Boolean(user.disabledAt);
  return `
    <article class="account-row ${disabled ? "disabled" : ""}">
      <div class="account-main">
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.username)}</span>
      </div>
      <span class="account-badge">${roleLabels[user.role] || user.role}</span>
      <span>${departmentName(user.departmentId)}</span>
      <span class="status-badge ${disabled ? "disabled" : "active"}">${disabled ? "禁用" : "启用"}</span>
      <div class="account-actions">
        <button type="button" data-account-action="edit" data-user-id="${user.id}">编辑</button>
        <button type="button" data-account-action="permissions" data-user-id="${user.id}">权限</button>
        <button type="button" data-account-action="toggle" data-user-id="${user.id}">${disabled ? "启用" : "禁用"}</button>
      </div>
    </article>
  `;
}

function renderAccountModal() {
  if (!state.accountModal) return "";
  const user = state.users.find((item) => item.id === state.accountEditingUserId) || null;
  if (state.accountModal === "permissions") return renderPermissionModal(user);
  if (state.accountModal === "departments") return renderDepartmentModal();
  const editing = state.accountModal === "edit";
  return `
    <div class="modal-backdrop" id="accountModalBackdrop">
      <form class="modal-card account-modal-card" id="accountModalForm">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">${editing ? "Edit Account" : "Create Account"}</p>
            <h2>${editing ? "编辑账号" : "新增账号"}</h2>
          </div>
          <button class="icon-button" id="closeAccountModal" type="button">×</button>
        </div>
        <div class="form-grid two-cols">
          <label><span>姓名</span><input name="name" value="${escapeAttr(user?.name || "")}" required /></label>
          <label><span>登录账号</span><input name="username" value="${escapeAttr(user?.username || "")}" required /></label>
          <label>
            <span>角色</span>
            <select name="role">
              ${Object.entries(roleLabels).map(([role, label]) => `<option value="${role}" ${user?.role === role ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>所属部门</span>
            <select name="departmentId">
              ${departmentOptions(user?.departmentId)}
            </select>
          </label>
          <label><span>${editing ? "新密码，留空则不修改" : "初始密码"}</span><input name="password" type="password" ${editing ? "" : "required"} minlength="6" /></label>
          <label>
            <span>状态</span>
            <select name="disabled">
              <option value="false" ${!user?.disabledAt ? "selected" : ""}>启用</option>
              <option value="true" ${user?.disabledAt ? "selected" : ""}>禁用</option>
            </select>
          </label>
        </div>
        <p class="message" id="accountModalMessage"></p>
        <div class="modal-actions">
          <button class="button secondary" id="cancelAccountModal" type="button">取消</button>
          <button class="button" type="submit">保存</button>
        </div>
      </form>
    </div>
  `;
}

function renderPermissionModal(user) {
  if (!user) return "";
  const custom = parsePermissionObject(user.customPermissions);
  const department = departmentById(user.departmentId);
  const departmentPreset = parsePermissionObject(department?.permissionPreset);
  const finalCodes = resolvePermissionPreview(user, department);
  return `
    <div class="modal-backdrop" id="accountModalBackdrop">
      <form class="modal-card account-modal-card" id="permissionForm">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Permissions</p>
            <h2>${escapeHtml(user.name)} 的权限</h2>
          </div>
          <button class="icon-button" id="closeAccountModal" type="button">×</button>
        </div>
        <div class="permission-summary">
          <span>角色：${roleLabels[user.role] || user.role}</span>
          <span>部门：${departmentName(user.departmentId)}</span>
          <span>部门预设：${departmentPreset.extra.length} 项</span>
          <span>最终权限：${finalCodes.length} 项</span>
        </div>
        <div class="permission-editor">
          ${permissionOptions().map((permission) => `
            <article>
              <strong>${permission.name}</strong>
              <span>${permission.group}</span>
              <label><input type="checkbox" name="extra" value="${permission.code}" ${custom.extra.includes(permission.code) ? "checked" : ""} /> 额外允许</label>
              <label><input type="checkbox" name="disabled" value="${permission.code}" ${custom.disabled.includes(permission.code) ? "checked" : ""} /> 禁用</label>
            </article>
          `).join("")}
        </div>
        <p class="message" id="accountModalMessage"></p>
        <div class="modal-actions">
          <button class="button secondary" id="cancelAccountModal" type="button">取消</button>
          <button class="button" type="submit">保存权限</button>
        </div>
      </form>
    </div>
  `;
}

function renderDepartmentModal() {
  const editing = state.departmentEditingId ? state.departments.find((item) => item.id === state.departmentEditingId) : null;
  return `
    <div class="modal-backdrop" id="accountModalBackdrop">
      <section class="modal-card account-modal-card">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Departments</p>
            <h2>部门管理</h2>
          </div>
          <button class="icon-button" id="closeAccountModal" type="button">×</button>
        </div>
        <form class="department-form" id="departmentForm">
          <input type="hidden" name="id" value="${escapeAttr(editing?.id || "")}" />
          <div class="form-grid two-cols">
            <label><span>部门名称</span><input name="name" value="${escapeAttr(editing?.name || "")}" required /></label>
            <label>
              <span>默认角色</span>
              <select name="defaultRole">
                ${Object.entries(roleLabels).map(([role, label]) => `<option value="${role}" ${editing?.defaultRole === role ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label class="wide-field"><span>部门说明</span><input name="description" value="${escapeAttr(editing?.description || "")}" /></label>
            <label>
              <span>状态</span>
              <select name="disabled">
                <option value="false" ${!editing?.disabledAt ? "selected" : ""}>启用</option>
                <option value="true" ${editing?.disabledAt ? "selected" : ""}>禁用</option>
              </select>
            </label>
          </div>
          <div class="permission-editor compact-permissions">
            ${permissionOptions().map((permission) => {
              const preset = parsePermissionObject(editing?.permissionPreset);
              return `
                <article>
                  <strong>${permission.name}</strong>
                  <span>${permission.group}</span>
                  <label><input type="checkbox" name="extra" value="${permission.code}" ${preset.extra.includes(permission.code) ? "checked" : ""} /> 预设允许</label>
                  <label><input type="checkbox" name="disabled" value="${permission.code}" ${preset.disabled.includes(permission.code) ? "checked" : ""} /> 预设禁用</label>
                </article>
              `;
            }).join("")}
          </div>
          <p class="message" id="departmentMessage"></p>
          <div class="modal-actions">
            ${editing ? '<button class="button secondary" id="newDepartmentButton" type="button">新建部门</button>' : ""}
            <button class="button" type="submit">${editing ? "保存部门" : "新增部门"}</button>
          </div>
        </form>
        <div class="department-preview">
          ${state.departments.map((dept) => `
            <article class="${dept.disabledAt ? "disabled" : ""}">
              <strong>${escapeHtml(dept.name)}</strong>
              <span>${escapeHtml(dept.description || "暂无说明")}</span>
              <span>默认角色：${roleLabels[dept.defaultRole] || dept.defaultRole || "未设置"} · ${dept.disabledAt ? "禁用" : "启用"}</span>
              <div class="account-actions">
                <button type="button" data-department-action="edit" data-department-id="${dept.id}">编辑</button>
                <button type="button" data-department-action="toggle" data-department-id="${dept.id}">${dept.disabledAt ? "启用" : "禁用"}</button>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function bindAccountManagementEvents() {
  document.querySelector("#openCreateAccountModal")?.addEventListener("click", () => {
    state.accountModal = "create";
    state.accountEditingUserId = "";
    render();
  });
  document.querySelector("#openDepartmentModal")?.addEventListener("click", () => {
    state.accountModal = "departments";
    state.accountEditingUserId = "";
    state.departmentEditingId = "";
    render();
  });
  document.querySelector("#accountSearchInput")?.addEventListener("input", (event) => {
    state.accountSearch = event.currentTarget.value.trim().toLowerCase();
    render();
  });
  document.querySelector("#accountRoleFilter")?.addEventListener("change", (event) => {
    state.accountRoleFilter = event.currentTarget.value;
    render();
  });
  document.querySelector("#accountStatusFilter")?.addEventListener("change", (event) => {
    state.accountStatusFilter = event.currentTarget.value;
    render();
  });
  document.querySelector(".account-list")?.addEventListener("click", handleAccountListClick);
  bindAccountModalEvents();
}

async function handleAccountListClick(event) {
  const button = event.target.closest("button[data-account-action]");
  if (!button) return;
  const user = state.users.find((item) => item.id === button.dataset.userId);
  if (!user) return;
  if (button.dataset.accountAction === "edit") {
    state.accountModal = "edit";
    state.accountEditingUserId = user.id;
    render();
    return;
  }
  if (button.dataset.accountAction === "permissions") {
    state.accountModal = "permissions";
    state.accountEditingUserId = user.id;
    render();
    return;
  }
  if (button.dataset.accountAction === "toggle") {
    const nextDisabled = !user.disabledAt;
    const confirmed = window.confirm(`确认${nextDisabled ? "禁用" : "启用"}账号“${user.name}”？`);
    if (!confirmed) return;
    await saveAccount(user.id, { disabled: String(nextDisabled) });
  }
}

function bindAccountModalEvents() {
  document.querySelector("#accountModalBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "accountModalBackdrop") return;
    closeAccountModal();
  });
  document.querySelector("#closeAccountModal")?.addEventListener("click", closeAccountModal);
  document.querySelector("#cancelAccountModal")?.addEventListener("click", closeAccountModal);
  document.querySelector("#accountModalForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!body.password) delete body.password;
    const editing = state.accountModal === "edit";
    await saveAccount(editing ? state.accountEditingUserId : "", body);
  });
  document.querySelector("#permissionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveAccount(state.accountEditingUserId, {
      customPermissions: JSON.stringify({
        extra: form.getAll("extra"),
        disabled: form.getAll("disabled"),
      }),
    });
  });
  document.querySelector("#departmentForm")?.addEventListener("submit", handleDepartmentSubmit);
  document.querySelector("#newDepartmentButton")?.addEventListener("click", () => {
    state.departmentEditingId = "";
    render();
  });
  document.querySelector(".department-preview")?.addEventListener("click", handleDepartmentListClick);
}

async function handleDepartmentSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const departmentId = form.get("id");
  const body = {
    name: form.get("name"),
    description: form.get("description"),
    defaultRole: form.get("defaultRole"),
    disabled: form.get("disabled"),
    permissionPreset: JSON.stringify({
      extra: form.getAll("extra"),
      disabled: form.getAll("disabled"),
    }),
  };
  const message = document.querySelector("#departmentMessage");
  if (message) message.textContent = "";
  try {
    if (departmentId) {
      await api(`/api/departments/${departmentId}`, { method: "PATCH", body });
    } else {
      await api("/api/departments", { method: "POST", body });
    }
    await refreshDepartments();
    state.departmentEditingId = "";
    render();
  } catch (error) {
    if (message) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  }
}

async function handleDepartmentListClick(event) {
  const button = event.target.closest("button[data-department-action]");
  if (!button) return;
  const department = state.departments.find((item) => item.id === button.dataset.departmentId);
  if (!department) return;
  if (button.dataset.departmentAction === "edit") {
    state.departmentEditingId = department.id;
    render();
    return;
  }
  const nextDisabled = !department.disabledAt;
  const confirmed = window.confirm(`确认${nextDisabled ? "禁用" : "启用"}部门“${department.name}”？`);
  if (!confirmed) return;
  await api(`/api/departments/${department.id}`, { method: "PATCH", body: { disabled: String(nextDisabled) } });
  await refreshDepartments();
  render();
}

async function saveAccount(userId, body) {
  const message = document.querySelector("#accountModalMessage");
  if (message) message.textContent = "";
  try {
    if (userId) {
      await api(`/api/users/${userId}`, { method: "PATCH", body });
    } else {
      await api("/api/users", { method: "POST", body });
    }
    const usersData = await api("/api/users");
    state.users = usersData.users;
    hydrateAssigneeFilter();
    closeAccountModal(false);
    render();
  } catch (error) {
    if (message) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    } else {
      window.alert(error.message);
    }
  }
}

async function refreshDepartments() {
  const data = await api("/api/departments");
  state.departments = data.departments || [];
}

function closeAccountModal(shouldRender = true) {
  state.accountModal = "";
  state.accountEditingUserId = "";
  state.departmentEditingId = "";
  if (shouldRender) render();
}

function departmentById(id) {
  return state.departments.find((item) => item.id === id);
}

function departmentName(id) {
  return departmentById(id)?.name || "未分配";
}

function departmentOptions(selectedId) {
  return state.departments
    .filter((dept) => !dept.disabledAt || dept.id === selectedId)
    .map((dept) => `<option value="${dept.id}" ${selectedId === dept.id ? "selected" : ""}>${escapeHtml(dept.name)}</option>`)
    .join("");
}

function parsePermissionObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : value || {};
    return {
      extra: Array.isArray(parsed.extra) ? parsed.extra.map(String) : [],
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled.map(String) : [],
    };
  } catch {
    return { extra: [], disabled: [] };
  }
}

function rolePermissionCodes(role) {
  const all = permissionOptions().map((item) => item.code);
  const map = {
    owner: all,
    service: ["tasks.create_public", "tasks.edit_brief", "files.upload", "files.download", "comments.write", "notes.write"],
    designer: ["tasks.create_private", "tasks.update_status", "files.upload", "files.download", "comments.write", "notes.write"],
  };
  return map[role] || [];
}

function resolvePermissionPreview(user, department) {
  const custom = parsePermissionObject(user.customPermissions);
  const preset = parsePermissionObject(department?.permissionPreset);
  const set = new Set([...rolePermissionCodes(user.role), ...preset.extra, ...custom.extra]);
  [...preset.disabled, ...custom.disabled].forEach((code) => set.delete(code));
  return [...set];
}

function permissionOptions() {
  return [
    { code: "users.manage", name: "账号管理", group: "用户、部门、权限" },
    { code: "departments.manage", name: "部门管理", group: "用户、部门、权限" },
    { code: "permissions.manage", name: "权限设置", group: "用户、部门、权限" },
    { code: "tasks.read_all", name: "查看全部任务", group: "任务" },
    { code: "tasks.create_public", name: "创建公共任务", group: "任务" },
    { code: "tasks.create_private", name: "创建个人任务", group: "任务" },
    { code: "tasks.edit_brief", name: "修改任务信息", group: "任务" },
    { code: "tasks.update_status", name: "更新任务状态", group: "任务" },
    { code: "tasks.delete", name: "删除任务", group: "任务" },
    { code: "files.upload", name: "上传附件", group: "附件" },
    { code: "files.download", name: "下载附件", group: "附件" },
    { code: "files.delete_own", name: "删除自己上传的文件", group: "附件" },
    { code: "files.delete_any", name: "删除任意文件", group: "附件" },
    { code: "comments.write", name: "写公开留言", group: "留言" },
    { code: "notes.write", name: "写个人备注", group: "个人备注" },
    { code: "archives.manage", name: "归档和恢复任务", group: "归档" },
    { code: "system.maintain", name: "系统维护", group: "维护" },
    { code: "operation_logs.view", name: "查看操作记录", group: "操作记录" },
    { code: "operation_logs.export", name: "导出操作记录", group: "操作记录" },
  ];
}

function bindArchiveButton() {
  document.querySelector("#archiveButton")?.addEventListener("click", async () => {
    const button = document.querySelector("#archiveButton");
    const message = document.querySelector("#archiveMessage");
    button.disabled = true;
    button.textContent = "正在归档";
    message.textContent = "";
    try {
      const data = await api("/api/archive", { method: "POST" });
      await loadData();
      message.style.color = "#2f9563";
      message.textContent = `归档完成：${data.zipPath}`;
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "归档全部已完成";
    }
  });
}
