function renderAccountManagementPage() {
  workspace.className = "workspace account";
  workspace.innerHTML = `
    <aside class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Create Account</p>
          <h2>新增账号</h2>
        </div>
      </div>
      <form class="form" id="accountForm">
        <label><span>姓名</span><input name="name" required placeholder="例如：小周" /></label>
        <label><span>登录账号</span><input name="username" required placeholder="例如：zhou" /></label>
        <label><span>密码</span><input name="password" type="password" required minlength="6" placeholder="至少 6 位" /></label>
        <label>
          <span>角色</span>
          <select name="role">
            <option value="designer">设计师</option>
            <option value="service">客服</option>
            <option value="owner">管理员</option>
          </select>
        </label>
        <button type="submit">新增账号</button>
        <p class="message" id="accountMessage"></p>
      </form>
    </aside>
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Team</p>
          <h2>团队账号修改</h2>
        </div>
      </div>
      <div class="people-list">
        ${state.users.map(renderUserEditor).join("")}
      </div>
    </section>
    <aside class="detail-panel">
      <section class="detail-card">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Archive</p>
            <h2>一键归档</h2>
          </div>
        </div>
        <p class="archive-copy">只归档已完成且未归档的项目，归档后会从客服和设计师页面隐藏，并生成 zip 压缩包。</p>
        <button class="button" id="archiveButton" type="button">归档全部已完成</button>
        <p class="message" id="archiveMessage"></p>
      </section>
    </aside>
  `;
  document.querySelector("#accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#accountMessage");
    message.textContent = "";
    try {
      await api("/api/users", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
      event.currentTarget.reset();
      const usersData = await api("/api/users");
      state.users = usersData.users;
      hydrateAssigneeFilter();
      message.style.color = "#2f9563";
      message.textContent = "账号已新增。";
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  });
  bindUserEditors();
  bindArchiveButton();
}

function renderUserEditor(user) {
  return `
    <form class="person-row user-edit-form" data-user-id="${user.id}">
      <label><span>姓名</span><input name="name" value="${escapeAttr(user.name)}" required /></label>
      <label><span>账号</span><input name="username" value="${escapeAttr(user.username)}" required /></label>
      <label>
        <span>角色</span>
        <select name="role">
          ${Object.keys(roleLabels).map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${roleLabels[role]}</option>`).join("")}
        </select>
      </label>
      <label><span>新密码</span><input name="password" type="password" minlength="6" placeholder="不改留空" /></label>
      <button type="submit">保存</button>
      <p class="message"></p>
    </form>
  `;
}

function bindUserEditors() {
  document.querySelectorAll(".user-edit-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = form.querySelector(".message");
      message.textContent = "";
      const body = Object.fromEntries(new FormData(form).entries());
      if (!body.password) delete body.password;
      try {
        await api(`/api/users/${form.dataset.userId}`, { method: "PATCH", body });
        const usersData = await api("/api/users");
        state.users = usersData.users;
        hydrateAssigneeFilter();
        message.style.color = "#2f9563";
        message.textContent = "已保存。";
      } catch (error) {
        message.style.color = "#cf4d40";
        message.textContent = error.message;
      }
    });
  });
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
      message.style.color = "#2f9563";
      message.textContent = `归档完成：${data.zipPath}`;
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "归档全部已完成";
    }
  });
}
