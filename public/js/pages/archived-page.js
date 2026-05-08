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
        <div class="section-actions">
          <button class="button secondary" id="scanArchiveMissing" type="button">扫描缺失文件</button>
          <button class="button" id="archiveButton" type="button">按项目归档全部已完成</button>
          <button class="button secondary" id="refreshTasks" type="button">刷新</button>
        </div>
      </div>
      <p class="message" id="archiveMessage"></p>
      ${renderArchiveMissingPanel()}
      ${renderTaskList(tasks)}
    </section>
    <aside class="detail-panel" id="detailPanel">${renderDetail()}</aside>
  `;
  bindTaskPageEvents();
  bindArchiveButton();
  bindArchiveMissingEvents();
  queueArchiveMissingAutoScan();
}

function renderArchiveMissingPanel() {
  const scan = state.archiveMissingScan;
  if (!scan) {
    return `
      <section class="archive-missing-panel">
        <div class="empty small-empty">尚未扫描归档缺失文件，系统会自动扫描，也可以点击“扫描缺失文件”。</div>
      </section>
    `;
  }
  const missingFiles = scan.missingFiles || [];
  const missingRefs = scan.missingFileReferences || [];
  const missingArchives = scan.missingArchives || [];
  const total = missingFiles.length + missingRefs.length + missingArchives.length;
  if (!total) {
    return `
      <section class="archive-missing-panel ok">
        <div class="empty small-empty">归档检查正常：没有发现缺失的本地文件或归档包。</div>
      </section>
    `;
  }
  return `
    <section class="archive-missing-panel warning">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Missing Local Files</p>
          <h2>发现 ${total} 个归档风险</h2>
        </div>
        <span>${formatDateTime(scan.scannedAt || new Date().toISOString())}</span>
      </div>
      ${missingFiles.length ? `
        <div class="maintenance-list operation-log-list simple-operation-log-list">
          ${missingFiles.map(renderMissingArchiveFile).join("")}
        </div>
      ` : ""}
      ${missingRefs.length ? `
        <div class="maintenance-list operation-log-list simple-operation-log-list">
          ${missingRefs.map((item) => `
            <article>
              <strong>${escapeHtml(item.taskTitle || item.taskId)}：附件记录异常</strong>
              <span>${escapeHtml(item.fileId || "未知文件")} · ${escapeHtml(item.reason || "文件记录不存在")}</span>
              <div class="task-card-actions">
                <button class="button danger compact-button" type="button" data-delete-missing-file-id="${escapeAttr(item.fileId)}">删除异常引用</button>
              </div>
            </article>
          `).join("")}
        </div>
      ` : ""}
      ${missingArchives.length ? `
        <div class="maintenance-list operation-log-list simple-operation-log-list">
          ${missingArchives.map(renderMissingArchivePackage).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderMissingArchiveFile(item) {
  return `
    <article>
      <strong>${escapeHtml(item.taskTitle || item.taskId)}：${escapeHtml(item.originalName || item.fileId)}</strong>
      <span>${escapeHtml(item.reason || "本地文件不存在")} · ${escapeHtml(item.relativePath || "")}</span>
      <div class="task-card-actions">
        <button class="button danger compact-button" type="button" data-delete-missing-file-id="${escapeAttr(item.fileId)}">删除缺失记录</button>
      </div>
    </article>
  `;
}

function renderMissingArchivePackage(item) {
  return `
    <article>
      <strong>${escapeHtml(item.taskTitle || item.taskId)}：归档包缺失</strong>
      <span>${escapeHtml(item.reason || "归档包本地文件不存在")} · ${escapeHtml(item.zipPath || "")}</span>
      <div class="task-card-actions">
        <button class="button danger compact-button" type="button" data-delete-task-id="${escapeAttr(item.taskId)}">删除归档任务</button>
      </div>
    </article>
  `;
}

function queueArchiveMissingAutoScan() {
  if (state.archiveMissingScan || state.archiveMissingScanLoading) return;
  state.archiveMissingScanLoading = true;
  setTimeout(async () => {
    try {
      await loadArchiveMissingScan();
      if (state.adminView === "archived") render();
    } finally {
      state.archiveMissingScanLoading = false;
    }
  }, 0);
}
