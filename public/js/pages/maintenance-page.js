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
          <input id="maintenanceKeyword" value="${escapeAttr(state.maintenanceKeyword)}" placeholder="搜索账号、任务或操作" />
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
    ["app.db-wal", summary.appWalSize || 0],
    ["operation.db", summary.operationDbSize || 0],
    ["operation.db-wal", summary.operationWalSize || 0],
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
      <button class="button secondary" type="button" data-maintenance-action="compactDatabases">整理数据库</button>
    </div>
    <div class="maintenance-result" id="maintenanceResult"></div>
  `;
}

function renderOperationLogs() {
  return `
    <div class="maintenance-list operation-log-list simple-operation-log-list">
      ${state.maintenanceLogs.length ? state.maintenanceLogs.map((log) => `
        <article>
          <strong>${escapeHtml(log.summary || "系统记录了一次操作")}</strong>
          <span>${formatDateTime(log.createdAt)}</span>
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
    compactDatabases: "/api/maintenance/compact-databases",
  }[action];
  if (!actionUrl) return;
  if (action === "cleanMissing" && !confirm("确认清理丢失文件对应的数据库记录？真实文件不会被批量删除。")) return;
  if (action === "compactDatabases" && !confirm("确认整理数据库？系统会尝试合并并截断 app.db-wal / operation.db-wal，执行期间请避免频繁操作。")) return;
  result.style.color = "";
  result.textContent = "执行中...";
  try {
    const data = await api(actionUrl, { method: "POST" });
    result.textContent = renderMaintenanceActionResult(action, data);
    await loadMaintenanceData();
    setTimeout(() => render(), 350);
  } catch (error) {
    result.style.color = "#cf4d40";
    result.textContent = error.message;
  }
}

function renderMaintenanceActionResult(action, data) {
  if (action === "scanMissing") return `扫描完成：发现 ${data.missingFiles?.length || 0} 条丢失文件记录`;
  if (action === "cleanMissing") return `清理完成：已清理 ${data.cleaned || 0} 条失效文件记录`;
  if (action === "scanOrphan") return `扫描完成：发现 ${data.orphanFiles?.length || 0} 个孤立文件`;
  if (action === "archiveLogs") {
    const pruned = data.pruned || {};
    return [
      data.alreadyArchived ? "昨天日志已经归档过" : "昨天日志已归档到日期文件夹",
      data.archiveDir ? `归档目录：${data.archiveDir}` : "",
      `操作记录：${data.operationCount || 0} 条，维护记录：${data.maintenanceCount || 0} 条`,
      `已从近期数据库移出旧日志：操作 ${pruned.operationLogs || 0} 条，维护 ${pruned.maintenanceRecords || 0} 条`,
    ].filter(Boolean).join("\n");
  }
  if (action !== "compactDatabases") return "操作完成";
  const before = data.before || {};
  const after = data.after || {};
  return [
    data.message || "数据库整理完成",
    `app.db-wal：${formatSize(before.appWalSize || 0)} → ${formatSize(after.appWalSize || 0)}`,
    `operation.db-wal：${formatSize(before.operationWalSize || 0)} → ${formatSize(after.operationWalSize || 0)}`,
  ].join("\n");
}
