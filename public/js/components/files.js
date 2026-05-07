const fileUsageLabels = {
  material: "客户资料",
  reference: "参考图",
  draft: "设计初稿",
  final: "设计终稿",
  source: "源文件",
  other: "其他",
};

function renderUploadForm() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task || !userHasPermission("files.upload") || !canOperateTask(task)) return "";
  const defaultUsage = state.user.role === "service" ? "material" : state.user.role === "designer" ? "draft" : "other";
  return `
    <section class="detail-card">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Upload</p>
          <h2>上传资料或设计稿</h2>
        </div>
      </div>
      <form class="upload-form upload-form-grid" id="uploadForm">
        <label>
          <span>文件类型</span>
          <select name="usage">
            ${Object.entries(fileUsageLabels).map(([value, label]) => `<option value="${value}" ${value === defaultUsage ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label><span>选择文件</span><input name="file" type="file" required /></label>
        <button type="submit">上传文件</button>
      </form>
    </section>
  `;
}

function renderFiles(task) {
  if (!task.attachments.length) return '<section class="detail-card file-list"><h2>文件</h2><div class="empty">还没有上传文件</div></section>';
  const canDownload = userHasPermission("files.download") && canOperateTask(task);
  const fileItem = (file) => `
    <article class="file-item">
      <div>
        <strong>${escapeHtml(file.originalName)}</strong>
        <span>${fileUsageLabels[file.usage || "other"] || "其他"} · ${formatSize(file.size)} · ${escapeHtml(file.uploadedByName)}（${roleLabels[file.uploadedByRole] || "成员"}） · ${formatDateTime(file.uploadedAt)}</span>
      </div>
      <div class="file-actions">
        ${canDownload ? `<a href="/api/files/${file.id}">下载</a>` : ""}
        ${canDeleteFile(file) ? `<button class="button danger compact-button" type="button" data-delete-file-id="${file.id}">删除</button>` : ""}
      </div>
    </article>
  `;
  const groups = groupFilesByUsage(task.attachments);
  return `
    <section class="detail-card file-list">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Files</p>
          <h2>文件</h2>
        </div>
      </div>
      ${groups.map((group) => `
        <section class="file-group">
          <div class="file-group-head">
            <strong>${group.label}</strong>
            <span>${group.files.length}</span>
          </div>
          ${group.files.map(fileItem).join("")}
        </section>
      `).join("")}
    </section>
  `;
}

function groupFilesByUsage(files) {
  return Object.entries(fileUsageLabels)
    .map(([usage, label]) => ({
      usage,
      label,
      files: files.filter((file) => (file.usage || "other") === usage),
    }))
    .filter((group) => group.files.length);
}

function canDeleteFile(file) {
  return userHasPermission("files.delete_any") || (userHasPermission("files.delete_own") && file.uploadedBy === state.user.id);
}
