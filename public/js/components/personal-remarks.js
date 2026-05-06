function renderPersonalRemark(task) {
  const records = (task.remarkRecords || []).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return `
    <section class="detail-card personal-remark-card">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Personal Notes</p>
          <h2>个人备注</h2>
        </div>
      </div>
      <div class="personal-remark-grid">
        <form class="remark-composer" id="personalRemarkForm">
          <label>
            <span>新增备注</span>
            <textarea name="text" rows="7" placeholder="写下这次处理记录，可以直接粘贴截图"></textarea>
          </label>
          <input id="remarkImageInput" type="file" accept="image/*" multiple hidden />
          <div class="remark-image-preview" id="remarkImagePreview"></div>
          <div class="remark-actions">
            <button class="button secondary" id="addRemarkImage" type="button">添加图片</button>
            <button class="button" type="submit">保存记录</button>
          </div>
          <p class="message" id="personalRemarkMessage"></p>
        </form>
        <div class="remark-record-panel">
          <div class="remark-record-head">
            <strong>记录</strong>
            <span>${records.length} 条</span>
          </div>
          <div class="remark-record-list">
            ${records.length ? records.map(renderPersonalRemarkRecord).join("") : '<div class="empty small-empty">还没有备注记录</div>'}
          </div>
        </div>
      </div>
    </section>
    ${renderRemarkImageViewer()}
  `;
}

function renderPersonalRemarkRecord(record) {
  const images = record.images || [];
  return `
    <article class="remark-record">
      <div class="message-head">
        <strong>${escapeHtml(record.authorName || "我")}</strong>
        <time>${formatDateTime(record.createdAt)}</time>
      </div>
      ${record.text ? `<p>${escapeHtml(record.text)}</p>` : ""}
      ${images.length ? `
        <div class="remark-record-images">
          ${images.map((image) => `
            <button type="button" data-remark-image-id="${image.id}" data-remark-image-name="${escapeAttr(image.originalName)}">
              <img src="/api/files/${image.id}/inline?t=${encodeURIComponent(record.createdAt || "")}" alt="${escapeAttr(image.originalName)}" loading="lazy" />
            </button>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function renderRemarkImageViewer() {
  if (!state.remarkImageViewer) return "";
  return `
    <div class="image-viewer-backdrop" id="remarkImageViewer">
      <div class="image-viewer-card">
        <div class="image-viewer-toolbar">
          <strong>${escapeHtml(state.remarkImageViewer.name || "图片预览")}</strong>
          <div>
            <button type="button" data-image-zoom="out">缩小</button>
            <button type="button" data-image-zoom="reset">${Math.round(state.remarkImageZoom * 100)}%</button>
            <button type="button" data-image-zoom="in">放大</button>
            <button type="button" data-image-viewer-close>关闭</button>
          </div>
        </div>
        <div class="image-viewer-stage">
          <img src="${state.remarkImageViewer.src}" alt="${escapeAttr(state.remarkImageViewer.name || "图片预览")}" style="transform: scale(${state.remarkImageZoom});" />
        </div>
      </div>
    </div>
  `;
}

function bindPersonalRemarkEvents() {
  const form = document.querySelector("#personalRemarkForm");
  if (!form) return;
  const textarea = form.querySelector('textarea[name="text"]');
  const input = document.querySelector("#remarkImageInput");
  const preview = document.querySelector("#remarkImagePreview");
  const message = document.querySelector("#personalRemarkMessage");

  const addImages = (files) => {
    const next = Array.from(files || [])
      .map(normalizeRemarkImage)
      .filter((file) => file && (file.type.startsWith("image/") || !file.type));
    state.pendingRemarkImages.push(...next);
    renderPendingRemarkImages(preview);
  };

  document.querySelector("#addRemarkImage")?.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    addImages(input.files);
    input.value = "";
  });
  textarea.addEventListener("paste", (event) => {
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    addImages(files);
  });
  preview.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-image]");
    if (!button) return;
    state.pendingRemarkImages.splice(Number(button.dataset.removeImage), 1);
    renderPendingRemarkImages(preview);
  });
  renderPendingRemarkImages(preview);

  document.querySelector(".remark-record-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remark-image-id]");
    if (!button) return;
    state.remarkImageViewer = {
      src: `/api/files/${button.dataset.remarkImageId}/inline?t=${Date.now()}`,
      name: button.dataset.remarkImageName || "图片预览",
    };
    state.remarkImageZoom = 1;
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    const body = new FormData();
    body.append("text", textarea.value);
    state.pendingRemarkImages.forEach((file) => body.append("images", file, file.name || "remark-image.png"));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api(`/api/tasks/${state.selectedTaskId}/remarks`, { method: "POST", body });
      state.pendingRemarkImages = [];
      textarea.value = "";
      await loadData();
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function bindRemarkImageViewerEvents() {
  const viewer = document.querySelector("#remarkImageViewer");
  if (!viewer) return;
  viewer.addEventListener("click", (event) => {
    if (event.target.id === "remarkImageViewer" || event.target.closest("[data-image-viewer-close]")) {
      state.remarkImageViewer = null;
      state.remarkImageZoom = 1;
      render();
      return;
    }
    const button = event.target.closest("button[data-image-zoom]");
    if (!button) return;
    if (button.dataset.imageZoom === "in") state.remarkImageZoom = Math.min(4, state.remarkImageZoom + 0.25);
    if (button.dataset.imageZoom === "out") state.remarkImageZoom = Math.max(0.25, state.remarkImageZoom - 0.25);
    if (button.dataset.imageZoom === "reset") state.remarkImageZoom = 1;
    render();
  });
}

function renderPendingRemarkImages(preview) {
  if (!preview) return;
  preview.innerHTML = state.pendingRemarkImages.length
    ? state.pendingRemarkImages.map((file, index) => `
      <figure>
        <img src="${URL.createObjectURL(file)}" alt="${escapeAttr(file.name || "remark image")}" />
        <button type="button" data-remove-image="${index}" title="移除图片">×</button>
      </figure>
    `).join("")
    : '<span>可粘贴图片，或点击添加图片</span>';
}

function clipboardImageFiles(clipboardData) {
  const files = Array.from(clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
  if (files.length) return files;
  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

function normalizeRemarkImage(file) {
  if (!file) return null;
  const type = file.type || "image/png";
  const name = file.name || `截图-${Date.now()}.png`;
  if (file.name && file.type) return file;
  try {
    return new File([file], name, { type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
