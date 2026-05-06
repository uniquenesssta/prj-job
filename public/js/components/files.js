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
