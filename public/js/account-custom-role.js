(function () {
  const originalRenderAccountModal = window.renderAccountModal;
  const originalBindAccountModalEvents = window.bindAccountModalEvents;

  window.accountRoleEntries = function accountRoleEntries() {
    return Object.entries(roleLabels).filter(([role]) => ["designer", "service", "custom"].includes(role));
  };

  window.renderAccountModal = function renderAccountModalWithCustomRole() {
    const html = originalRenderAccountModal();
    if (!html || !["create", "edit"].includes(state.accountModal)) return html;
    const user = state.users.find((item) => item.id === state.accountEditingUserId) || null;
    const value = escapeAttr(user?.customRoleName || "");
    const style = user?.role === "custom" ? "" : "display:none";
    const required = user?.role === "custom" ? "required" : "";
    const customRoleField = `
      <label id="accountCustomRoleField" style="${style}">
        <span>自定义角色名称</span>
        <input name="customRoleName" id="accountCustomRoleNameInput" value="${value}" placeholder="例如：运营、审核员、主管" maxlength="24" ${required} />
      </label>
    `;
    return html.replace('</select>\n          </label>\n          <label>\n            <span>所属部门</span>', `</select>\n          </label>\n          ${customRoleField}\n          <label>\n            <span>所属部门</span>`);
  };

  window.bindAccountModalEvents = function bindAccountModalEventsWithCustomRole() {
    originalBindAccountModalEvents();
    syncAccountCustomRoleField();
    document.querySelector('#accountModalForm select[name="role"]')?.addEventListener("change", syncAccountCustomRoleField);
  };

  function syncAccountCustomRoleField() {
    const roleSelect = document.querySelector('#accountModalForm select[name="role"]');
    const field = document.querySelector("#accountCustomRoleField");
    const input = document.querySelector("#accountCustomRoleNameInput");
    if (!roleSelect || !field || !input) return;
    const visible = roleSelect.value === "custom";
    field.style.display = visible ? "" : "none";
    input.required = visible;
    if (!visible) input.value = "";
  }
})();
