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
            ${accountRoleEntries().map(([role, label]) => `<option value="${role}" ${state.accountRoleFilter === role ? "selected" : ""}>${label}</option>`).join("")}
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
              ${accountRoleEntries().map(([role, label]) => `<option value="${role}" ${user?.role === role ? "selected" : ""}>${label}</option>`).join("")}
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

function renderDepartmentModal() {
  const editing = state.departmentEditingId ? state.departments.find((item) => item.id === state.departmentEditingId) : null;
  const preset = parsePermissionObject(editing?.permissionPreset);
  const grouped = groupPermissionOptions();
  const defaultRole = editing?.defaultRole || "designer";
  const customRoleVisible = defaultRole === "custom";
  return `
    <div class="modal-backdrop" id="accountModalBackdrop">
      <section class="modal-card department-modal-card">
        <div class="section-head compact-head department-modal-head">
          <div>
            <p class="eyebrow">Departments</p>
            <h2>部门管理</h2>
          </div>
          <button class="icon-button" id="closeAccountModal" type="button">×</button>
        </div>
        <div class="department-modal-layout">
          <form class="department-form" id="departmentForm">
            <input type="hidden" name="id" value="${escapeAttr(editing?.id || "")}" />
            <div class="form-grid department-form-grid">
              <label><span>部门名称</span><input name="name" value="${escapeAttr(editing?.name || "")}" required /></label>
              <label>
                <span>默认角色</span>
                <select name="defaultRole" id="departmentDefaultRole">
                  ${Object.entries(roleLabels).map(([role, label]) => `<option value="${role}" ${defaultRole === role ? "selected" : ""}>${label}</option>`).join("")}
                </select>
              </label>
              <label class="custom-role-field" id="customRoleField" style="${customRoleVisible ? "" : "display:none"}">
                <span>自定义角色名称</span>
                <input name="customRoleName" id="customRoleNameInput" value="${escapeAttr(editing?.customRoleName || "")}" placeholder="例如：运营、主管、审核员" maxlength="24" ${customRoleVisible ? "required" : ""} />
              </label>
              <label>
                <span>状态</span>
                <select name="disabled">
                  <option value="false" ${!editing?.disabledAt ? "selected" : ""}>启用</option>
                  <option value="true" ${editing?.disabledAt ? "selected" : ""}>禁用</option>
                </select>
              </label>
              <label class="wide-field"><span>部门说明</span><input name="description" value="${escapeAttr(editing?.description || "")}" /></label>
            </div>
            <section class="department-permission-groups">
              ${Object.entries(grouped).map(([group, permissions]) => `
                <article class="permission-group-card">
                  <div class="permission-group-title">
                    <strong>${escapeHtml(group)}</strong>
                    <span>${permissions.length}</span>
                  </div>
                  <div class="permission-group-list">
                    ${permissions.map((permission) => `
                      <div class="permission-row department-permission-row">
                        <div>
                          <strong>${permission.name}</strong>
                          <span>${permission.code}</span>
                        </div>
                        <label class="permission-check allow"><input type="checkbox" name="extra" value="${permission.code}" ${preset.extra.includes(permission.code) ? "checked" : ""} />允许</label>
                        <label class="permission-check deny"><input type="checkbox" name="disabled" value="${permission.code}" ${preset.disabled.includes(permission.code) ? "checked" : ""} />禁用</label>
                      </div>
                    `).join("")}
                  </div>
                </article>
              `).join("")}
            </section>
            <p class="message" id="departmentMessage"></p>
            <div class="modal-actions">
              ${editing ? '<button class="button secondary" id="newDepartmentButton" type="button">新建部门</button>' : ""}
              <button class="button" type="submit">${editing ? "保存部门" : "新增部门"}</button>
            </div>
          </form>
          <aside class="department-preview">
            <div class="department-preview-title">
              <strong>部门列表</strong>
              <span>${state.departments.length}</span>
            </div>
            ${state.departments.map((dept) => `
              <article class="${dept.disabledAt ? "disabled" : ""}">
                <strong>${escapeHtml(dept.name)}</strong>
                <span>${escapeHtml(dept.description || "暂无说明")}</span>
                <span>默认角色：${departmentRoleLabel(dept)} · ${dept.disabledAt ? "禁用" : "启用"}</span>
                <div class="account-actions">
                  <button type="button" data-department-action="edit" data-department-id="${dept.id}">编辑</button>
                  <button type="button" data-department-action="toggle" data-department-id="${dept.id}">${dept.disabledAt ? "启用" : "禁用"}</button>
                </div>
              </article>
            `).join("")}
          </aside>
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
      customPermissions: JSON.stringify(normalizePermissionFormData(form)),
    });
  });
  bindPermissionConflictGuards(document.querySelector("#permissionForm"));
  bindPermissionConflictGuards(document.querySelector("#departmentForm"));
  document.querySelector("#departmentDefaultRole")?.addEventListener("change", syncCustomRoleField);
  document.querySelector("#departmentForm")?.addEventListener("submit", handleDepartmentSubmit);
  document.querySelector("#newDepartmentButton")?.addEventListener("click", () => {
    state.departmentEditingId = "";
    render();
  });
  document.querySelector(".department-preview")?.addEventListener("click", handleDepartmentListClick);
}

function syncCustomRoleField() {
  const select = document.querySelector("#departmentDefaultRole");
  const field = document.querySelector("#customRoleField");
  const input = document.querySelector("#customRoleNameInput");
  if (!select || !field || !input) return;
  const isCustom = select.value === "custom";
  field.style.display = isCustom ? "" : "none";
  input.required = isCustom;
  if (!isCustom) input.value = "";
}

function bindPermissionConflictGuards(root) {
  if (!root) return;
  root.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="checkbox"][name="extra"], input[type="checkbox"][name="disabled"]');
    if (!input || !input.checked) return;
    const otherName = input.name === "extra" ? "disabled" : "extra";
    const other = root.querySelector(`input[type="checkbox"][name="${otherName}"][value="${CSS.escape(input.value)}"]`);
    if (other) other.checked = false;
  });
}

async function handleDepartmentSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const departmentId = form.get("id");
  const body = {
    name: form.get("name"),
    description: form.get("description"),
    defaultRole: form.get("defaultRole"),
    customRoleName: form.get("customRoleName"),
    disabled: form.get("disabled"),
    permissionPreset: JSON.stringify(normalizePermissionFormData(form)),
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

function departmentRoleLabel(department) {
  if (!department) return "未设置";
  if (department.defaultRole === "custom") return department.customRoleName || "自定义";
  return roleLabels[department.defaultRole] || department.defaultRole || "未设置";
}

function accountRoleEntries() {
  return Object.entries(roleLabels).filter(([role]) => role !== "custom");
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
    return normalizePermissionObject(parsed);
  } catch {
    return { extra: [], disabled: [] };
  }
}

function normalizePermissionFormData(form) {
  return normalizePermissionObject({
    extra: form.getAll("extra"),
    disabled: form.getAll("disabled"),
  });
}

function normalizePermissionObject(value) {
  const extra = uniquePermissionCodes(value?.extra);
  const disabled = uniquePermissionCodes(value?.disabled).filter((code) => !extra.includes(code));
  return { extra, disabled };
}

function uniquePermissionCodes(values) {
  const allowed = new Set(permissionOptions().map((item) => item.code));
  return [...new Set((Array.isArray(values) ? values : []).map(String))].filter((code) => allowed.has(code));
}

function rolePermissionCodes(role) {
  const all = permissionOptions().map((item) => item.code);
  const map = {
    owner: all,
    service: [
      "tasks.create_public",
      "tasks.edit_brief",
      "tasks.update_status",
      "tasks.flow.review_to_done",
      "tasks.flow.to_blocked",
      "tasks.flow.reopen",
      "tasks.fields.title.edit",
      "tasks.fields.description.edit",
      "tasks.fields.wechat.edit",
      "tasks.fields.orderNo.edit",
      "tasks.fields.taobaoId.edit",
      "tasks.fields.assigneeId.edit",
      "tasks.fields.dueDate.edit",
      "tasks.fields.priority.edit",
      "tasks.fields.taskType.edit",
      "tasks.fields.sizeSpec.edit",
      "tasks.fields.deliverFormat.edit",
      "tasks.fields.customerRequirement.edit",
      "tasks.fields.remark.edit",
      "files.upload",
      "files.download",
      "comments.write",
      "notes.write",
    ],
    designer: [
      "tasks.create_private",
      "tasks.update_status",
      "tasks.flow.todo_to_doing",
      "tasks.flow.doing_to_review",
      "tasks.flow.to_blocked",
      "tasks.flow.reopen",
      "tasks.fields.description.edit",
      "tasks.fields.taskType.edit",
      "tasks.fields.sizeSpec.edit",
      "tasks.fields.deliverFormat.edit",
      "tasks.fields.remark.edit",
      "files.upload",
      "files.download",
      "comments.write",
      "notes.write",
    ],
    custom: [],
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
    { code: "tasks.edit_brief", name: "修改任务信息（旧权限）", group: "任务" },
    { code: "tasks.update_status", name: "更新任务状态（旧权限）", group: "任务" },
    { code: "tasks.delete", name: "删除任务", group: "任务" },
    { code: "tasks.flow.todo_to_doing", name: "待开始 → 进行中", group: "流程权限" },
    { code: "tasks.flow.doing_to_review", name: "进行中 → 待审核", group: "流程权限" },
    { code: "tasks.flow.review_to_done", name: "待审核 → 已完成", group: "流程权限" },
    { code: "tasks.flow.to_blocked", name: "标记为受阻", group: "流程权限" },
    { code: "tasks.flow.reopen", name: "重新打开任务", group: "流程权限" },
    { code: "tasks.fields.title.edit", name: "编辑任务标题", group: "字段权限" },
    { code: "tasks.fields.description.edit", name: "编辑任务说明", group: "字段权限" },
    { code: "tasks.fields.wechat.edit", name: "编辑微信号", group: "字段权限" },
    { code: "tasks.fields.orderNo.edit", name: "编辑订单号", group: "字段权限" },
    { code: "tasks.fields.taobaoId.edit", name: "编辑淘宝ID", group: "字段权限" },
    { code: "tasks.fields.assigneeId.edit", name: "修改设计师", group: "字段权限" },
    { code: "tasks.fields.dueDate.edit", name: "修改截止日期", group: "字段权限" },
    { code: "tasks.fields.priority.edit", name: "修改优先级", group: "字段权限" },
    { code: "tasks.fields.taskType.edit", name: "编辑任务类型", group: "字段权限" },
    { code: "tasks.fields.sizeSpec.edit", name: "编辑尺寸规格", group: "字段权限" },
    { code: "tasks.fields.deliverFormat.edit", name: "编辑交付格式", group: "字段权限" },
    { code: "tasks.fields.customerRequirement.edit", name: "编辑客户原始需求", group: "字段权限" },
    { code: "tasks.fields.remark.edit", name: "编辑内部备注", group: "字段权限" },
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
    { code: "views.other_designers", name: "查看其他设计师", group: "视图权限" },
    { code: "views.other_services", name: "查看其他客服", group: "视图权限" },
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

function renderPermissionModal(user) {
  if (!user) return "";
  const custom = parsePermissionObject(user.customPermissions);
  const department = departmentById(user.departmentId);
  const departmentPreset = parsePermissionObject(department?.permissionPreset);
  const finalCodes = resolvePermissionPreview(user, department);
  const grouped = groupPermissionOptions();
  return `
    <div class="modal-backdrop" id="accountModalBackdrop">
      <form class="modal-card permission-modal-card" id="permissionForm">
        <div class="permission-modal-head">
          <div>
            <p class="eyebrow">Permissions</p>
            <h2>${escapeHtml(user.name)} 的权限</h2>
          </div>
          <button class="icon-button" id="closeAccountModal" type="button">×</button>
        </div>
        <div class="permission-modal-layout">
          <aside class="permission-profile">
            <strong>${escapeHtml(user.name)}</strong>
            <span>${escapeHtml(user.username)}</span>
            <div class="permission-profile-grid">
              <article><small>角色</small><b>${roleLabels[user.role] || user.role}</b></article>
              <article><small>部门</small><b>${departmentName(user.departmentId)}</b></article>
              <article><small>部门预设</small><b>${departmentPreset.extra.length}</b></article>
              <article><small>最终权限</small><b>${finalCodes.length}</b></article>
            </div>
            <p>权限 = 角色基础权限 + 部门预设 + 个人额外允许 - 个人禁用。</p>
          </aside>
          <section class="permission-groups">
            ${Object.entries(grouped).map(([group, permissions]) => `
              <article class="permission-group-card">
                <div class="permission-group-title">
                  <strong>${escapeHtml(group)}</strong>
                  <span>${permissions.length}</span>
                </div>
                <div class="permission-group-list">
                  ${permissions.map((permission) => `
                    <div class="permission-row">
                      <div>
                        <strong>${permission.name}</strong>
                        <span>${permission.code}</span>
                      </div>
                      <label class="permission-check allow"><input type="checkbox" name="extra" value="${permission.code}" ${custom.extra.includes(permission.code) ? "checked" : ""} />允许</label>
                      <label class="permission-check deny"><input type="checkbox" name="disabled" value="${permission.code}" ${custom.disabled.includes(permission.code) ? "checked" : ""} />禁用</label>
                    </div>
                  `).join("")}
                </div>
              </article>
            `).join("")}
          </section>
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

function groupPermissionOptions() {
  return permissionOptions().reduce((groups, permission) => {
    if (!groups[permission.group]) groups[permission.group] = [];
    groups[permission.group].push(permission);
    return groups;
  }, {});
}
