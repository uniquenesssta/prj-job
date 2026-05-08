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
    const peerButton = event.target.closest("button[data-peer-view]");
    if (peerButton) {
      state.peerViewModal = peerButton.dataset.peerView;
      state.peerViewSelectedId = "";
      state.peerViewSearch = "";
      state.peerViewStatus = "all";
      adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === peerButton));
      render();
      return;
    }
    const homeButton = event.target.closest("button[data-workspace-home]");
    if (homeButton) {
      state.peerViewModal = "";
      adminTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === homeButton));
      render();
      return;
    }
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

  quickFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-quick-filter]");
    if (!button) return;
    state.quickFilter = button.dataset.quickFilter;
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

function bindTaskPageEvents() {
  document.querySelector("#refreshTasks")?.addEventListener("click", reloadTasks);
  document.querySelector("#taskList")?.addEventListener("click", async (event) => {
    const missingFileDeleteButton = event.target.closest("button[data-delete-missing-file-id]");
    if (missingFileDeleteButton) {
      await deleteMissingArchiveFile(missingFileDeleteButton.dataset.deleteMissingFileId);
      return;
    }
    const archiveDownloadButton = event.target.closest("button[data-download-archive-task-id]");
    if (archiveDownloadButton) {
      const taskId = archiveDownloadButton.dataset.downloadArchiveTaskId;
      const task = state.tasks.find((item) => item.id === taskId);
      await downloadArchive(taskId, task?.title || "archive");
      return;
    }
    const deleteButton = event.target.closest("button[data-delete-task-id]");
    if (deleteButton) {
      await deleteTask(deleteButton.dataset.deleteTaskId);
      return;
    }
    const button = event.target.closest("button[data-task-id]");
    if (!button) return;
    state.selectedTaskId = button.dataset.taskId;
    state.briefEditOpen = false;
    state.pendingRemarkImages = [];
    await loadPersonalNotes(state.selectedTaskId);
    render();
  });
  bindDetailEvents();
}

function bindArchiveButton() {
  const button = document.querySelector("#archiveButton");
  if (!button) return;
  button.addEventListener("click", async () => {
    const message = document.querySelector("#archiveMessage");
    if (!confirm("确认将所有已完成且未归档的任务按项目分别打包归档？")) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "归档中";
    if (message) {
      message.style.color = "";
      message.textContent = "正在按项目生成归档包...";
    }
    try {
      const data = await api("/api/archive", { method: "POST" });
      if (message) {
        message.style.color = "#2f9563";
        message.textContent = `已归档 ${data.archivedTasks || 0} 个项目。`;
      }
      state.archiveMissingScan = null;
      await loadData();
      render();
    } catch (error) {
      if (error.data?.code === "ARCHIVE_MISSING_FILES") state.archiveMissingScan = error.data;
      if (message) {
        message.style.color = "#cf4d40";
        message.textContent = describeArchiveIntegrityError(error);
      } else {
        alert(describeArchiveIntegrityError(error));
      }
      if (error.data?.code === "ARCHIVE_MISSING_FILES") render();
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

function bindArchiveMissingEvents() {
  document.querySelector("#scanArchiveMissing")?.addEventListener("click", async () => {
    await loadArchiveMissingScan();
    render();
  });
  document.querySelectorAll("[data-delete-missing-file-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteMissingArchiveFile(button.dataset.deleteMissingFileId);
    });
  });
  document.querySelectorAll(".archive-missing-panel [data-delete-task-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteTask(button.dataset.deleteTaskId);
    });
  });
}

async function loadArchiveMissingScan() {
  state.archiveMissingScan = await api("/api/archive/missing-files");
}

async function deleteMissingArchiveFile(fileId) {
  if (!fileId) return;
  if (!confirm("确认删除这条缺失文件记录？只会删除数据库中的失效记录，不会删除真实文件。")) return;
  await api(`/api/archive/missing-files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  await loadArchiveMissingScan();
  await loadData();
  render();
}

function describeArchiveIntegrityError(error) {
  const data = error?.data || {};
  if (data.code !== "ARCHIVE_MISSING_FILES") return error.message || "操作失败";
  const missingFiles = data.missingFiles || [];
  const missingRefs = data.missingFileReferences || [];
  const examples = missingFiles.slice(0, 3).map((item) => `- ${item.taskTitle || item.taskId}：${item.originalName || item.fileId}`);
  const refExamples = missingRefs.slice(0, 2).map((item) => `- ${item.taskTitle || item.taskId}：${item.fileId}`);
  return [
    data.error || "发现缺失文件，已阻止归档。",
    ...examples,
    ...refExamples,
    missingFiles.length + missingRefs.length > examples.length + refExamples.length ? "请在归档页查看完整列表并删除缺失记录。" : "请删除缺失记录或重新上传后再归档。",
  ].filter(Boolean).join("\n");
}

function bindDetailEvents() {
  document.querySelector("#closeTaskDetailModal")?.addEventListener("click", () => {
    state.taskDetailModalOpen = false;
    render();
  });
  document.querySelector("#taskDetailBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id !== "taskDetailBackdrop") return;
    state.taskDetailModalOpen = false;
    render();
  });

  document.querySelectorAll("[data-download-file-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "下载中";
      try {
        await downloadFile(button.dataset.downloadFileId, button.dataset.downloadFileName || "download");
      } catch (error) {
        alert(error.message || "下载失败");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });

  document.querySelectorAll("[data-delete-file-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteFile(button.dataset.deleteFileId);
    });
  });

  document.querySelector("#archiveTaskButton")?.addEventListener("click", async () => {
    try {
      await api(`/api/tasks/${state.selectedTaskId}/archive`, { method: "POST" });
      state.archiveMissingScan = null;
      state.selectedTaskId = null;
      await loadData();
      render();
    } catch (error) {
      if (error.data?.code === "ARCHIVE_MISSING_FILES") {
        state.archiveMissingScan = error.data;
        render();
      }
      alert(describeArchiveIntegrityError(error));
    }
  });

  document.querySelector("#downloadArchiveButton")?.addEventListener("click", async () => {
    const task = state.tasks.find((item) => item.id === state.selectedTaskId);
    await downloadArchive(state.selectedTaskId, task?.title || "archive");
  });

  document.querySelector("#restoreTaskButton")?.addEventListener("click", async () => {
    await api(`/api/tasks/${state.selectedTaskId}/restore`, { method: "POST" });
    state.selectedTaskId = null;
    await loadData();
    render();
  });

  document.querySelector("#deleteTaskButton")?.addEventListener("click", async () => {
    await deleteTask(state.selectedTaskId);
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

  bindPublicCommentEvents();
  bindPersonalRemarkEvents();
  bindRemarkImageViewerEvents();
}

async function updateTask(body) {
  await api(`/api/tasks/${state.selectedTaskId}`, { method: "PATCH", body });
  await loadData();
  render();
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!confirm(`确认删除任务「${task.title}」？删除后默认不在任务池显示。`)) return;
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  if (state.selectedTaskId === taskId) state.selectedTaskId = null;
  state.taskDetailModalOpen = false;
  await loadData();
  render();
}

async function deleteFile(fileId) {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  const file = task?.attachments?.find((item) => item.id === fileId);
  if (!file) return;
  if (!confirm(`确认删除文件「${file.originalName}」？`)) return;
  await api(`/api/files/${fileId}`, { method: "DELETE" });
  await loadData();
  render();
}

async function downloadFile(fileId, filename) {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const message = await readDownloadError(response);
    throw new Error(message);
  }

  const blob = await response.blob();
  downloadBlob(blob, filename || getFilenameFromDisposition(response.headers.get("Content-Disposition")) || "download");
}

async function downloadArchive(taskId, filename) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/archive/download`, {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const message = await readDownloadError(response);
    throw new Error(message);
  }

  const blob = await response.blob();
  const fallback = `${sanitizeDownloadName(filename || "archive")}-归档.zip`;
  downloadBlob(blob, getFilenameFromDisposition(response.headers.get("Content-Disposition")) || fallback);
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "download";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function readDownloadError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      return data.error || `下载失败（${response.status}）`;
    } catch {
      return `下载失败（${response.status}）`;
    }
  }
  const text = await response.text().catch(() => "");
  return text || `下载失败（${response.status}）`;
}

function getFilenameFromDisposition(value) {
  const header = String(value || "");
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const fallbackMatch = header.match(/filename="?([^";]+)"?/i);
  return fallbackMatch ? fallbackMatch[1] : "";
}

function sanitizeDownloadName(value) {
  return String(value || "download").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120) || "download";
}
