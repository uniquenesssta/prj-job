const state = {
  user: null,
  users: [],
  tasks: [],
  selectedTaskId: null,
  status: "all",
  assignee: "all",
  search: "",
  adminView: "designer",
  layout: "card",
  events: null,
  briefEditOpen: false,
};

const statusLabels = {
  todo: "待开始",
  doing: "进行中",
  review: "待审核",
  done: "已完成",
  blocked: "卡住了",
};

const priorityLabels = {
  low: "低",
  normal: "普通",
  high: "重要",
  urgent: "加急",
};

const roleLabels = {
  owner: "管理员",
  designer: "设计师",
  service: "客服",
};

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const workspace = document.querySelector("#workspace");
const metrics = document.querySelector("#metrics");
const adminTabs = document.querySelector("#adminTabs");
const viewTabs = document.querySelector("#viewTabs");
const assigneeFilter = document.querySelector("#assigneeFilter");
const assigneeFilterWrap = document.querySelector("#assigneeFilterWrap");
const searchInput = document.querySelector("#searchInput");
const layoutSwitch = document.querySelector("#designerLayoutSwitch");

async function boot() {
  bindStaticEvents();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await loadData();
    showApp();
    connectEvents();
  } catch {
    showLogin();
  }
}

function bindStaticEvents() {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const form = new FormData(loginForm);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: {
          username: form.get("username"),
          password: form.get("password"),
        },
      });
      state.user = data.user;
      await loadData();
      showApp();
      connectEvents();
    } catch (error) {
      loginError.textContent = error.message;
    }
  });

  document.querySelector("#logoutButton").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    state.selectedTaskId = null;
    state.briefEditOpen = false;
    if (state.events) state.events.close();
    state.events = null;
    showLogin();
  });

  adminTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-admin-view]");
    if (!button) return;
    state.adminView = button.dataset.adminView;
    state.selectedTaskId = null;
    state.briefEditOpen = false;
    adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    await loadData();
    render();
  });

  viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button) return;
    state.status = button.dataset.status;
    viewTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });

  assigneeFilter.addEventListener("change", () => {
    state.assignee = assigneeFilter.value;
    render();
  });

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.trim().toLowerCase();
    render();
  });

  layoutSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-layout]");
    if (!button) return;
    state.layout = button.dataset.layout;
    layoutSwitch.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
}

async function api(url, options = {}) {
  const init = { method: options.method || "GET", headers: options.headers || {} };
  if (options.body && !(options.body instanceof FormData)) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  } else if (options.body) {
    init.body = options.body;
  }
  const response = await fetch(url, init);
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function loadData() {
  const taskUrl = state.user?.role === "owner" && state.adminView === "archived" ? "/api/tasks?archived=1" : "/api/tasks";
  const [usersData, tasksData] = await Promise.all([api("/api/users"), api(taskUrl)]);
  state.users = usersData.users;
  state.tasks = tasksData.tasks;
  hydrateAssigneeFilter();
}

async function reloadTasks() {
  const selected = state.selectedTaskId;
  await loadData();
  state.selectedTaskId = selected;
  render();
}

function showLogin() {
  loginForm.reset();
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  document.querySelector("#currentUser").textContent = `${state.user.name} · ${roleLabels[state.user.role]}`;
  adminTabs.hidden = state.user.role !== "owner";
  render();
}

function connectEvents() {
  if (state.events) state.events.close();
  state.events = new EventSource("/api/events");
  const refresh = async () => {
    const selected = state.selectedTaskId;
    await loadData();
    state.selectedTaskId = selected;
    render();
  };
  for (const eventName of ["tasks-changed", "files-changed", "comments-changed", "users-changed"]) {
    state.events.addEventListener(eventName, refresh);
  }
}

function hydrateAssigneeFilter() {
  const designers = state.users.filter((user) => user.role === "designer");
  assigneeFilter.innerHTML = '<option value="all">全部</option>' + designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
}

function currentView() {
  if (state.user.role === "owner") return state.adminView;
  return state.user.role;
}

function render() {
  const view = currentView();
  renderHeader(view);
  renderToolbar(view);
  renderMetrics(view);
  if (view === "account") renderAccountPage();
  if (view === "designer") renderDesignerPage();
  if (view === "service") renderServicePage();
  if (view === "archived") renderArchivedPage();
}

function renderHeader(view) {
  const titleMap = {
    designer: state.user.role === "owner" ? "设计师执行视图" : "我的设计任务",
    service: state.user.role === "owner" ? "客服录单视图" : "客服任务录入",
    account: "账号管理",
    archived: "归档项目",
  };
  const subtitleMap = {
    designer: "优先级、截止时间、留言和附件集中在一张清爽任务池里。",
    service: "把客户微信、订单号、淘宝ID和设计要求一次录清楚。",
    account: "新增管理员、客服或设计师账号，并查看当前团队。",
    archived: "已归档项目默认对客服和设计师隐藏，管理员可在这里查看并恢复显示。",
  };
  document.querySelector("#roleEyebrow").textContent = state.user.role === "owner" ? "Admin Console" : roleLabels[state.user.role];
  document.querySelector("#pageTitle").textContent = titleMap[view];
  document.querySelector("#pageSubtitle").textContent = subtitleMap[view];
}

function renderToolbar(view) {
  viewTabs.hidden = view === "account";
  assigneeFilterWrap.hidden = view !== "designer" || state.user.role !== "owner";
  searchInput.closest("label").hidden = view === "account";
  layoutSwitch.hidden = !["designer", "archived"].includes(view);
}

function renderMetrics(view) {
  const tasks = filteredTasks(view);
  const metricItems =
    view === "account"
      ? [
          ["总账号", state.users.length],
          ["设计师", state.users.filter((user) => user.role === "designer").length],
          ["客服", state.users.filter((user) => user.role === "service").length],
          ["管理员", state.users.filter((user) => user.role === "owner").length],
        ]
      : [
          ["任务数", tasks.length],
          ["进行中", tasks.filter((task) => task.status === "doing").length],
          ["待审核", tasks.filter((task) => task.status === "review").length],
          ["临近截止", tasks.filter(isDueSoon).length],
        ];
  metrics.innerHTML = metricItems.map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function renderDesignerPage() {
  const tasks = filteredTasks("designer");
  workspace.className = `${state.user.role === "owner" ? "workspace admin-designer" : "workspace designer"} ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Design Tasks</p>
          <h2>任务池</h2>
        </div>
        <button class="button secondary" id="refreshTasks" type="button">刷新</button>
      </div>
      ${renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
  `;
  bindTaskPageEvents();
}

function renderServicePage() {
  const tasks = filteredTasks("service");
  workspace.className = `${state.user.role === "owner" ? "workspace admin-service" : "workspace service"} ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <aside class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">New Order</p>
          <h2>新建任务</h2>
        </div>
      </div>
      ${renderTaskForm()}
    </aside>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Customer Tasks</p>
          <h2>客服任务池</h2>
        </div>
        <button class="button secondary" id="refreshTasks" type="button">刷新</button>
      </div>
      ${renderTaskList(tasks)}
    </section>
  `;
  bindTaskForm();
  bindTaskPageEvents();
}

function renderArchivedPage() {
  const tasks = filteredTasks("archived");
  workspace.className = `workspace admin-designer ${state.selectedTaskId ? "detail-focus" : ""}`;
  workspace.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Archived Tasks</p>
          <h2>归档项目</h2>
        </div>
        <button class="button secondary" id="refreshTasks" type="button">刷新</button>
      </div>
      ${renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
  `;
  bindTaskPageEvents();
}

function renderAccountPage() {
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

function renderTaskForm() {
  const designers = state.users.filter((user) => user.role === "designer");
  return `
    <form class="form" id="taskForm">
      <label><span>任务名称</span><input name="title" required placeholder="例如：详情页主图精修" /></label>
      <label><span>任务说明</span><textarea name="description" rows="4" placeholder="尺寸、风格、文案、参考图、交付格式"></textarea></label>
      <div class="form-grid">
        <label><span>微信号</span><input name="wechat" placeholder="客户微信号" /></label>
        <label><span>订单号</span><input name="orderNo" placeholder="订单号" /></label>
      </div>
      <label><span>淘宝ID</span><input name="taobaoId" placeholder="淘宝买家ID或店铺ID" /></label>
      <div class="form-grid">
        <label>
          <span>设计师</span>
          <select name="assigneeId" required>${designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
        <label>
          <span>优先级</span>
          <select name="priority">
            <option value="normal">普通</option>
            <option value="high">重要</option>
            <option value="urgent">加急</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
      <label><span>截止日期</span><input name="dueDate" type="date" /></label>
      <button type="submit">创建并派单</button>
      <p class="message" id="taskMessage"></p>
    </form>
  `;
}

function renderTaskList(tasks) {
  if (!tasks.length) return '<div class="empty">没有匹配的任务</div>';
  const mode = state.layout === "list" ? "list-mode" : "";
  return `
    <div class="task-list ${mode}" id="taskList">
      ${tasks.map(renderTaskCard).join("")}
    </div>
  `;
}

function renderTaskCard(task) {
  const recent = recentComments(task, 3);
  return `
    <article class="task-card priority-${task.priority} ${task.id === state.selectedTaskId ? "selected" : ""}">
      <button class="task-button" type="button" data-task-id="${task.id}">
        <div>
          <strong class="task-title">${escapeHtml(task.title)}</strong>
          <p class="task-desc">${escapeHtml(task.description || "暂无说明")}</p>
        </div>
        <span class="pill ${task.status}">${statusLabels[task.status]}</span>
        <span class="pill ${task.priority}">${priorityLabels[task.priority]}</span>
        <span>${task.dueDate || "未设截止"}</span>
      </button>
      <div class="task-meta">
        <span>设计师：${escapeHtml(task.assigneeName)}</span>
        <span>客服：${escapeHtml(task.creatorName)}</span>
        <span>${task.dueDate ? `截止：${task.dueDate}` : "未设截止"}</span>
        ${task.orderNo ? `<span>订单：${escapeHtml(task.orderNo)}</span>` : ""}
      </div>
      <div class="task-comment">
        <span>最新留言 ${recent.length}/${task.comments?.length || 0}</span>
        ${
          recent.length
            ? recent.map((comment) => `<p>${escapeHtml(comment.authorName)}：${escapeHtml(comment.text)}</p>`).join("")
            : "<p>暂无留言</p>"
        }
      </div>
    </article>
  `;
}

function renderDetail() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task) return '<div class="empty">选择一个任务查看详情</div>';
  return `
    <div class="detail-stack">
      <section class="detail-card detail-hero">
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">Task Detail</p>
            <h2>${escapeHtml(task.title)}</h2>
          </div>
          <span class="pill ${task.priority}">${priorityLabels[task.priority]}</span>
        </div>
        <p class="detail-desc">${escapeHtml(task.description || "暂无说明")}</p>
        ${renderArchiveControls(task)}
      </section>
      <div class="detail-layout">
        <section class="detail-card detail-main">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">Order Info</p>
              <h2>任务信息</h2>
            </div>
          </div>
          ${renderInlineInfo(task)}
        </section>
        ${renderComments(task)}
      </div>
      ${renderUploadForm()}
      ${renderFiles(task)}
    </div>
  `;
}

function renderArchiveControls(task) {
  if (state.user.role !== "owner") return "";
  if (task.archivedAt) {
    return `
      <div class="archive-actions">
        <span>已归档：${formatDateTime(task.archivedAt)}</span>
        <button class="button secondary" id="restoreTaskButton" type="button">恢复显示</button>
      </div>
    `;
  }
  if (task.status === "done") {
    return `
      <div class="archive-actions">
        <span>已完成，可单独归档</span>
        <button class="button" id="archiveTaskButton" type="button">归档此任务</button>
      </div>
    `;
  }
  return "";
}

function renderInlineInfo(task) {
  const editable = canEditBrief(task);
  const designers = state.users.filter((user) => user.role === "designer");
  const readonly = (label, value) => `<div class="info-tile"><span>${label}</span><strong>${escapeHtml(value || "未填写")}</strong></div>`;

  if (!editable) {
    return `
      <form class="inline-info-form" id="statusForm">
        <div class="summary-strip">
          ${readonly("微信号", task.wechat)}
          ${readonly("订单号", task.orderNo)}
          ${readonly("淘宝ID", task.taobaoId)}
        </div>
        <div class="work-strip">
          ${readonly("设计师", task.assigneeName)}
          ${readonly("客服", task.creatorName)}
          <label class="info-tile status-cell"><span>状态</span><select name="status">${statusOptions(task.status)}</select></label>
        </div>
        <button type="submit">更新状态</button>
      </form>
    `;
  }

  return `
    <form class="inline-info-form" id="briefForm">
      <div class="summary-strip">
        <label class="info-tile"><span>微信号</span><input name="wechat" value="${escapeAttr(task.wechat || "")}" /></label>
        <label class="info-tile"><span>订单号</span><input name="orderNo" value="${escapeAttr(task.orderNo || "")}" /></label>
        <label class="info-tile"><span>淘宝ID</span><input name="taobaoId" value="${escapeAttr(task.taobaoId || "")}" /></label>
      </div>
      <div class="work-strip">
        <label class="info-tile">
          <span>设计师</span>
          <select name="assigneeId">${designers.map((user) => `<option value="${user.id}" ${user.id === task.assigneeId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
        <label class="info-tile"><span>状态</span><select name="status">${statusOptions(task.status)}</select></label>
        <label class="info-tile"><span>截止日期</span><input name="dueDate" type="date" value="${task.dueDate || ""}" /></label>
      </div>
      <div class="inline-extra">
        <label>
          <span>优先级</span>
          <select name="priority">${Object.keys(priorityLabels).map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${priorityLabels[priority]}</option>`).join("")}</select>
        </label>
        <label>
          <span>任务说明</span>
          <textarea name="description" rows="2">${escapeHtml(task.description || "")}</textarea>
        </label>
      </div>
      <button type="submit">保存修改</button>
    </form>
  `;
}

function statusOptions(currentStatus) {
  return Object.keys(statusLabels).map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${statusLabels[status]}</option>`).join("");
}

function renderBriefEditor(task) {
  const designers = state.users.filter((user) => user.role === "designer");
  return `
    <form class="update-form divider" id="briefForm">
      <label><span>任务说明</span><textarea name="description" rows="3">${escapeHtml(task.description || "")}</textarea></label>
      <div class="update-grid">
        <label><span>微信号</span><input name="wechat" value="${escapeAttr(task.wechat || "")}" /></label>
        <label><span>订单号</span><input name="orderNo" value="${escapeAttr(task.orderNo || "")}" /></label>
      </div>
      <label><span>淘宝ID</span><input name="taobaoId" value="${escapeAttr(task.taobaoId || "")}" /></label>
      <div class="update-grid">
        <label>
          <span>改派设计师</span>
          <select name="assigneeId">${designers.map((user) => `<option value="${user.id}" ${user.id === task.assigneeId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
        <label><span>截止日期</span><input name="dueDate" type="date" value="${task.dueDate || ""}" /></label>
      </div>
      <label>
        <span>优先级</span>
        <select name="priority">${Object.keys(priorityLabels).map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${priorityLabels[priority]}</option>`).join("")}</select>
      </label>
      <button type="submit">保存修改</button>
    </form>
  `;
}

function renderStatusEditor(task) {
  return `
    <form class="update-form divider" id="statusForm">
      <label>
        <span>状态</span>
        <select name="status">${Object.keys(statusLabels).map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}</select>
      </label>
      <button type="submit">更新状态</button>
    </form>
  `;
}

function renderUploadForm() {
  return `
    <section class="detail-card">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Upload</p>
          <h2>上传资料或设计稿</h2>
        </div>
      </div>
      <form class="upload-form" id="uploadForm">
        <label><span>选择文件</span><input name="file" type="file" required /></label>
        <button type="submit">上传文件</button>
      </form>
    </section>
  `;
}

function renderFiles(task) {
  if (!task.attachments.length) return '<section class="detail-card file-list"><h2>文件</h2><div class="empty">还没有上传文件</div></section>';
  const myFiles = task.attachments.filter((file) => file.uploadedBy === state.user.id);
  const otherFiles = task.attachments.filter((file) => file.uploadedBy !== state.user.id);
  const fileItem = (file) => `
    <article class="file-item">
      <div>
        <strong>${escapeHtml(file.originalName)}</strong>
        <span>${formatSize(file.size)} · ${escapeHtml(file.uploadedByName)}（${roleLabels[file.uploadedByRole] || "成员"}）· ${formatDateTime(file.uploadedAt)}</span>
      </div>
      <a href="/api/files/${file.id}">下载</a>
    </article>
  `;
  return `
    <section class="detail-card file-list">
      <h2>我上传的文件</h2>
      ${myFiles.length ? myFiles.map(fileItem).join("") : '<div class="empty">你还没有上传文件</div>'}
      <h2>可下载文件</h2>
      ${otherFiles.length ? otherFiles.map(fileItem).join("") : '<div class="empty">暂无其他人上传的文件</div>'}
    </section>
  `;
}

function renderComments(task) {
  const comments = task.comments || [];
  return `
    <section class="detail-card comments">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Messages</p>
          <h2>留言</h2>
        </div>
      </div>
      <div class="comment-list">
        ${
          comments.length
            ? comments.map((comment) => `
                <article class="message-card ${comment.authorRole}">
                  <div class="message-head">
                    <div>
                      <strong>${escapeHtml(comment.authorName)}</strong>
                      <span>${roleLabels[comment.authorRole] || "成员"}</span>
                    </div>
                    <time>${formatDateTime(comment.createdAt)}</time>
                  </div>
                  <p>${escapeHtml(comment.text)}</p>
                </article>
              `).join("")
            : '<div class="empty">还没有留言</div>'
        }
      </div>
      <form class="comment-form message-card composer" id="commentForm">
        <textarea name="text" rows="3" required placeholder="写下修改意见、交付说明或客户反馈"></textarea>
        <button type="submit">发送留言</button>
      </form>
    </section>
  `;
}

function bindTaskForm() {
  const form = document.querySelector("#taskForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#taskMessage");
    message.textContent = "";
    try {
      await api("/api/tasks", { method: "POST", body: Object.fromEntries(new FormData(form).entries()) });
      form.reset();
      message.style.color = "#2f9563";
      message.textContent = "任务已创建并派给设计师。";
      await loadData();
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  });
}

function bindTaskPageEvents() {
  document.querySelector("#refreshTasks")?.addEventListener("click", reloadTasks);
  document.querySelector("#taskList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-task-id]");
    if (!button) return;
    state.selectedTaskId = button.dataset.taskId;
    state.briefEditOpen = false;
    render();
  });
  bindDetailEvents();
}

function bindDetailEvents() {
  document.querySelector("#archiveTaskButton")?.addEventListener("click", async () => {
    await api(`/api/tasks/${state.selectedTaskId}/archive`, { method: "POST" });
    state.selectedTaskId = null;
    await loadData();
    render();
  });

  document.querySelector("#restoreTaskButton")?.addEventListener("click", async () => {
    await api(`/api/tasks/${state.selectedTaskId}/restore`, { method: "POST" });
    state.selectedTaskId = null;
    await loadData();
    render();
  });

  document.querySelector("#toggleBriefEdit")?.addEventListener("click", () => {
    state.briefEditOpen = !state.briefEditOpen;
    render();
  });

  document.querySelector("#briefForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateTask(Object.fromEntries(new FormData(event.currentTarget).entries()));
    state.briefEditOpen = false;
  });

  document.querySelector("#statusForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateTask({ status: form.get("status") });
  });

  document.querySelector("#uploadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    button.textContent = "上传中";
    try {
      await api(`/api/tasks/${state.selectedTaskId}/upload`, { method: "POST", body: new FormData(event.currentTarget) });
      await loadData();
      render();
    } finally {
      button.disabled = false;
      button.textContent = "上传文件";
    }
  });

  document.querySelector("#commentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await api(`/api/tasks/${state.selectedTaskId}/comments`, {
        method: "POST",
        body: { text: form.get("text") },
      });
      event.currentTarget.reset();
      await loadData();
      render();
    } finally {
      button.disabled = false;
    }
  });
}

async function updateTask(body) {
  await api(`/api/tasks/${state.selectedTaskId}`, { method: "PATCH", body });
  await loadData();
  render();
}

function filteredTasks(view) {
  return state.tasks.filter((task) => {
    const archivedOk = view === "archived" ? Boolean(task.archivedAt) : !task.archivedAt;
    const statusOk = state.status === "all" || task.status === state.status;
    const assigneeOk = state.assignee === "all" || task.assigneeId === state.assignee || view !== "designer" || state.user.role !== "owner";
    const text = `${task.title} ${task.description} ${task.assigneeName} ${task.creatorName} ${task.wechat} ${task.orderNo} ${task.taobaoId} ${latestComment(task)?.text || ""}`.toLowerCase();
    const searchOk = !state.search || text.includes(state.search);
    return archivedOk && statusOk && assigneeOk && searchOk;
  });
}

function canEditBrief(task) {
  return state.user.role === "owner" || (state.user.role === "service" && task.creatorId === state.user.id);
}

function latestComment(task) {
  const comments = task.comments || [];
  return comments[comments.length - 1] || null;
}

function recentComments(task, count) {
  return (task.comments || []).slice(-count).reverse();
}

function isDueSoon(task) {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.dueDate}T00:00:00`);
  const days = Math.ceil((due - today) / 86400000);
  return days >= 0 && days <= 3;
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

boot();
