const state = {
  user: null,
  users: [],
  tasks: [],
  selectedTaskId: null,
  status: "all",
  assignee: "all",
  search: "",
};

const labels = {
  status: {
    todo: "待开始",
    doing: "进行中",
    review: "待审核",
    done: "已完成",
    blocked: "卡住了",
  },
  priority: {
    low: "低",
    normal: "普通",
    high: "重要",
    urgent: "加急",
  },
};

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const currentUser = document.querySelector("#currentUser");
const taskList = document.querySelector("#taskList");
const detailPanel = document.querySelector("#detailPanel");
const taskTemplate = document.querySelector("#taskTemplate");
const createPanel = document.querySelector("#createPanel");
const taskForm = document.querySelector("#taskForm");
const memberForm = document.querySelector("#memberForm");
const formMessage = document.querySelector("#formMessage");
const memberMessage = document.querySelector("#memberMessage");
const assigneeSelect = document.querySelector("#assigneeSelect");
const assigneeFilter = document.querySelector("#assigneeFilter");
const searchInput = document.querySelector("#searchInput");

async function boot() {
  bindEvents();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await loadAppData();
    showApp();
  } catch {
    showLogin();
  }
}

function bindEvents() {
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
      await loadAppData();
      showApp();
    } catch (error) {
      loginError.textContent = error.message;
    }
  });

  document.querySelector("#logoutButton").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    state.tasks = [];
    state.selectedTaskId = null;
    showLogin();
  });

  document.querySelector("#refreshButton").addEventListener("click", loadAndRenderTasks);

  document.querySelector("#statusTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button) return;
    state.status = button.dataset.status;
    document.querySelectorAll("#statusTabs button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
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

  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";
    const form = new FormData(taskForm);
    try {
      await api("/api/tasks", {
        method: "POST",
        body: Object.fromEntries(form.entries()),
      });
      taskForm.reset();
      formMessage.style.color = "#2f9563";
      formMessage.textContent = "任务已分配。";
      await loadAndRenderTasks();
    } catch (error) {
      formMessage.style.color = "#cf4d40";
      formMessage.textContent = error.message;
    }
  });

  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    memberMessage.textContent = "";
    const form = new FormData(memberForm);
    try {
      await api("/api/users", {
        method: "POST",
        body: Object.fromEntries(form.entries()),
      });
      memberForm.reset();
      memberMessage.style.color = "#2f9563";
      memberMessage.textContent = "成员已添加，可立即分配任务。";
      await loadAppData();
      render();
    } catch (error) {
      memberMessage.style.color = "#cf4d40";
      memberMessage.textContent = error.message;
    }
  });
}

async function api(url, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: options.headers || {},
  };

  if (options.body && !(options.body instanceof FormData)) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  } else if (options.body) {
    init.body = options.body;
  }

  const response = await fetch(url, init);
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

async function loadAppData() {
  const [usersData, tasksData] = await Promise.all([api("/api/users"), api("/api/tasks")]);
  state.users = usersData.users;
  state.tasks = tasksData.tasks;
  hydrateUsers();
}

async function loadAndRenderTasks() {
  const data = await api("/api/tasks");
  state.tasks = data.tasks;
  if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = null;
  }
  render();
}

function hydrateUsers() {
  const designers = state.users.filter((user) => user.role !== "owner");
  assigneeSelect.innerHTML = designers
    .map((user) => `<option value="${user.id}">${escapeHtml(user.name)}（${escapeHtml(user.username)}）</option>`)
    .join("");

  assigneeFilter.innerHTML =
    '<option value="all">全部</option>' +
    state.users
      .map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`)
      .join("");
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  currentUser.textContent = `${state.user.name} · ${state.user.role === "owner" ? "管理员" : "设计师"}`;
  createPanel.hidden = state.user.role !== "owner";
  render();
}

function render() {
  renderMetrics();
  renderTaskList();
  renderDetail();
}

function renderMetrics() {
  const visible = filteredTasks();
  document.querySelector("#metricTotal").textContent = visible.length;
  document.querySelector("#metricDoing").textContent = visible.filter((task) => task.status === "doing").length;
  document.querySelector("#metricReview").textContent = visible.filter((task) => task.status === "review").length;
  document.querySelector("#metricDue").textContent = visible.filter(isDueSoon).length;
}

function renderTaskList() {
  const visible = filteredTasks();
  taskList.innerHTML = "";

  if (visible.length === 0) {
    taskList.innerHTML = '<div class="empty-state">没有匹配的任务</div>';
    return;
  }

  visible.forEach((task) => {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(`priority-${task.priority}`, `status-${task.status}`);
    node.querySelector('[data-field="title"]').textContent = task.title;
    node.querySelector('[data-field="description"]').textContent = task.description || "暂无说明";
    node.querySelector('[data-field="assignee"]').textContent = task.assigneeName;
    node.querySelector('[data-field="due"]').textContent = task.dueDate ? `截止 ${task.dueDate}` : "未设截止";
    node.querySelector('[data-field="progressBar"]').style.setProperty("--progress", `${task.progress}%`);
    const status = node.querySelector('[data-field="status"]');
    status.textContent = labels.status[task.status] || task.status;
    status.classList.add(`status-${task.status}`);
    node.querySelector(".task-main").addEventListener("click", () => {
      state.selectedTaskId = task.id;
      renderDetail();
      document.querySelectorAll(".task-card").forEach((item) => item.classList.remove("selected"));
      node.classList.add("selected");
    });
    taskList.append(node);
  });
}

function renderDetail() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId) || filteredTasks()[0];
  if (!task) {
    detailPanel.innerHTML = `
      <div class="empty-detail">
        <p class="eyebrow">Detail</p>
        <h2>选择一个任务</h2>
        <p>查看说明、调整状态、上传设计稿或下载交付文件。</p>
      </div>
    `;
    return;
  }

  state.selectedTaskId = task.id;
  const canEditBrief = state.user.role === "owner";
  detailPanel.innerHTML = `
    <div class="detail-stack">
      <div class="detail-title-row">
        <div>
          <p class="eyebrow">Task Detail</p>
          <h2>${escapeHtml(task.title)}</h2>
        </div>
        <span class="priority-pill priority-${task.priority}">${labels.priority[task.priority] || task.priority}</span>
      </div>
      <p class="detail-description">${escapeHtml(task.description || "暂无说明")}</p>
      <div class="detail-grid">
        <div class="info-tile"><span>负责人</span><strong>${escapeHtml(task.assigneeName)}</strong></div>
        <div class="info-tile"><span>截止日期</span><strong>${task.dueDate || "未设置"}</strong></div>
        <div class="info-tile"><span>当前状态</span><strong>${labels.status[task.status] || task.status}</strong></div>
        <div class="info-tile"><span>完成进度</span><strong>${task.progress}%</strong></div>
      </div>
      ${canEditBrief ? renderOwnerEdit(task) : ""}
      ${renderProgressEditor(task)}
      ${renderUpload(task)}
      ${renderFiles(task)}
    </div>
  `;

  bindDetailEvents(task);
}

function renderOwnerEdit(task) {
  const userOptions = state.users
    .filter((user) => user.role !== "owner")
    .map((user) => `<option value="${user.id}" ${user.id === task.assigneeId ? "selected" : ""}>${escapeHtml(user.name)}</option>`)
    .join("");

  return `
    <form class="update-box" id="briefForm">
      <div class="row">
        <label>
          <span>改派给</span>
          <select name="assigneeId">${userOptions}</select>
        </label>
        <label>
          <span>截止日期</span>
          <input name="dueDate" type="date" value="${task.dueDate || ""}" />
        </label>
      </div>
      <label>
        <span>优先级</span>
        <select name="priority">
          ${["low", "normal", "high", "urgent"].map((item) => `<option value="${item}" ${item === task.priority ? "selected" : ""}>${labels.priority[item]}</option>`).join("")}
        </select>
      </label>
      <button type="submit">保存分配</button>
    </form>
  `;
}

function renderProgressEditor(task) {
  return `
    <form class="update-box" id="progressForm">
      <div class="row">
        <label>
          <span>状态</span>
          <select name="status">
            ${["todo", "doing", "review", "done", "blocked"].map((item) => `<option value="${item}" ${item === task.status ? "selected" : ""}>${labels.status[item]}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>进度</span>
          <input name="progress" type="number" min="0" max="100" value="${task.progress}" />
        </label>
      </div>
      <button type="submit">更新进度</button>
    </form>
  `;
}

function renderUpload(task) {
  return `
    <form class="upload-box" id="uploadForm">
      <label>
        <span>上传设计稿或客户资料</span>
        <input name="file" type="file" required />
      </label>
      <button type="submit">上传文件</button>
    </form>
  `;
}

function renderFiles(task) {
  if (!task.attachments.length) {
    return `
      <div class="file-list">
        <h2>文件</h2>
        <div class="empty-state">这个任务还没有上传文件</div>
      </div>
    `;
  }

  return `
    <div class="file-list">
      <h2>文件</h2>
      ${task.attachments
        .map(
          (file) => `
            <div class="file-item">
              <div>
                <strong>${escapeHtml(file.originalName)}</strong>
                <span>${formatSize(file.size)} · ${escapeHtml(file.uploadedByName)} · ${formatDateTime(file.uploadedAt)}</span>
              </div>
              <a href="/api/files/${file.id}">下载</a>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function bindDetailEvents(task) {
  const briefForm = document.querySelector("#briefForm");
  if (briefForm) {
    briefForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(briefForm);
      await updateTask(task.id, Object.fromEntries(form.entries()));
    });
  }

  document.querySelector("#progressForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateTask(task.id, {
      status: form.get("status"),
      progress: Number(form.get("progress")),
    });
  });

  document.querySelector("#uploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    button.textContent = "上传中";
    try {
      await api(`/api/tasks/${task.id}/upload`, { method: "POST", body: form });
      await loadAndRenderTasks();
    } finally {
      button.disabled = false;
      button.textContent = "上传文件";
    }
  });
}

async function updateTask(taskId, body) {
  await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body,
  });
  await loadAndRenderTasks();
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    const statusOk = state.status === "all" || task.status === state.status;
    const assigneeOk = state.assignee === "all" || task.assigneeId === state.assignee;
    const text = `${task.title} ${task.description} ${task.assigneeName}`.toLowerCase();
    const searchOk = !state.search || text.includes(state.search);
    return statusOk && assigneeOk && searchOk;
  });
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
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

boot();
