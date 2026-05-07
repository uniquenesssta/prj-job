async function renderMaintenancePage() {
  workspace.className = "workspace maintenance-workspace";
  workspace.innerHTML = '<section class="panel"><div class="empty">正在读取维护数据...</div></section>';
  await loadMaintenanceData();
  workspace.innerHTML = `
    <section class="panel maintenance-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Maintenance</p>
          <h2>系统维护</h2>
        </div>
        <div class="section-actions">
          <button class="button secondary" id="refreshMaintenance" type="button">刷新</button>
        </div>
      </div>
      ${renderMaintenanceSummary()}
      ${renderMaintenanceActions()}
      ${renderMaintenanceRecords()}
    </section>
    <section class="panel maintenance-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Operation Logs</p>
          <h2>操作记录</h2>
        </div>
      </div>
      <div class="account-toolbar">
        <label>
          <span>搜索记录</span>
          <input id="maintenanceKeyword" value="${escapeAttr(state.maintenanceKeyword)}" placeholder="操作人、动作、任务或详情" />
        </label>
        <button class="button" id="searchOperationLogs" type="button">查询</button>
      </div>
      ${renderOperationLogs()}
    </section>
  `;
  workspace.querySelector(".section-actions")?.insertAdjacentHTML("afterbegin", '<button class="button" id="openAccountManagement" type="button">账号管理</button>');
  bindMaintenanceEvents();
}

async function loadMaintenanceData() {
  const [summaryData, logsData] = await Promise.all([
    api("/api/maintenance/summary"),
    api(`/api/operation-logs?keyword=${encodeURIComponent(state.maintenanceKeyword)}`),
  ]);
  state.maintenanceSummary = summaryData;
  state.maintenanceLogs = logsData.logs || [];
}

function renderMaintenanceSummary() {
  const summary = state.maintenanceSummary?.summary || {};
  const items = [
    ["app.db", summary.appDbSize || 0],
    ["operation.db", summary.operationDbSize || 0],
    ["uploads", summary.uploadDirSize || 0],
    ["archives", summary.archiveDirSize || 0],
    ["operation-logs", summary.operationLogDirSize || 0],
  ];
  return `
    <div class="maintenance-grid">
      ${items.map(([label, size]) => `
        <article class="maintenance-card">
          <span>${label}</span>
          <strong>${formatSize(size)}</strong>
        </article>
      `).join("")}
      <article class="maintenance-card warning"><span>丢失文件记录</span><strong>${summary.missingFiles || 0}</strong></article>
      <article class="maintenance-card"><span>孤立文件</span><strong>${summary.orphanFiles || 0}</strong></article>
      <article class="maintenance-card"><span>文件记录</span><strong>${summary.fileRecords || 0}</strong></article>
    </div>
  `;
}

function renderMaintenanceActions() {
  return `
    <div class="maintenance-actions">
      <button class="button secondary" type="button" data-maintenance-action="scanMissing">扫描丢失文件</button>
      <button class="button danger" type="button" data-maintenance-action="cleanMissing">清理失效记录</button>
      <button class="button secondary" type="button" data-maintenance-action="scanOrphan">扫描孤立文件</button>
      <button class="button" type="button" data-maintenance-action="archiveLogs">归档昨天日志</button>
    </div>
    <div class="maintenance-result" id="maintenanceResult"></div>
  `;
}

function renderMaintenanceRecords() {
  const records = state.maintenanceSummary?.recentMaintenance || [];
  const archives = state.maintenanceSummary?.logArchives || [];
  return `
    <div class="maintenance-columns">
      <section>
        <h3>最近维护</h3>
        <div class="maintenance-list">
          ${records.length ? records.map((record) => `<article><strong>${escapeHtml(record.action)}</strong><span>${escapeHtml(record.status)} · ${formatDateTime(record.createdAt)} · ${escapeHtml(record.detail || "")}</span></article>`).join("") : '<div class="empty small-empty">暂无维护记录</div>'}
        </div>
      </section>
      <section>
        <h3>日志归档</h3>
        <div class="maintenance-list">
          ${archives.length ? archives.map((record) => `<article><strong>${escapeHtml(record.archiveDate)}</strong><span>${record.recordCount} 条 · ${escapeHtml(record.archivePath || "")}</span></article>`).join("") : '<div class="empty small-empty">暂无归档记录</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderOperationLogs() {
  return `
    <div class="maintenance-list operation-log-list">
      ${state.maintenanceLogs.length ? state.maintenanceLogs.map((log) => `
        <article>
          <strong>${escapeHtml(log.action)}</strong>
          <span>${escapeHtml(log.userName || "系统")} · ${escapeHtml(log.targetType || "")}/${escapeHtml(log.targetId || "")} · ${formatDateTime(log.createdAt)}</span>
          <p>${escapeHtml(log.detail || "")}</p>
        </article>
      `).join("") : '<div class="empty small-empty">没有匹配的操作记录</div>'}
    </div>
  `;
}

function bindMaintenanceEvents() {
  workspace.querySelector("#openAccountManagement")?.addEventListener("click", () => {
    state.adminView = "account";
    render();
  });
  workspace.querySelector("#refreshMaintenance")?.addEventListener("click", () => render());
  workspace.querySelector("#maintenanceKeyword")?.addEventListener("input", (event) => {
    state.maintenanceKeyword = event.currentTarget.value.trim();
  });
  workspace.querySelector("#searchOperationLogs")?.addEventListener("click", () => render());
  workspace.querySelectorAll("[data-maintenance-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runMaintenanceAction(button.dataset.maintenanceAction);
    });
  });
}

async function runMaintenanceAction(action) {
  const result = workspace.querySelector("#maintenanceResult");
  const actionUrl = {
    scanMissing: "/api/maintenance/scan-missing-files",
    cleanMissing: "/api/maintenance/clean-missing-files",
    scanOrphan: "/api/maintenance/scan-orphan-files",
    archiveLogs: "/api/maintenance/archive-operation-logs",
  }[action];
  if (!actionUrl) return;
  if (action === "cleanMissing" && !confirm("确认清理丢失文件对应的数据库记录？真实文件不会被批量删除。")) return;
  result.textContent = "执行中...";
  const data = await api(actionUrl, { method: "POST" });
  result.textContent = JSON.stringify(data);
  await loadMaintenanceData();
  render();
}
