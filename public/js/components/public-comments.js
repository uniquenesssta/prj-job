function renderPublicComments(task) {
  const comments = (task.comments || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return `
    <section class="detail-card comments public-comments">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Messages</p>
          <h2>留言</h2>
        </div>
      </div>
      <div class="comment-list">
        ${comments.length ? comments.map(renderPublicComment).join("") : '<div class="empty small-empty">还没有留言</div>'}
      </div>
      <form class="comment-form composer" id="publicCommentForm">
        <div class="quick-replies">
          ${quickReplyTexts().map((text) => `<button type="button" data-quick-reply="${escapeAttr(text)}">${escapeHtml(text)}</button>`).join("")}
        </div>
        <textarea name="text" placeholder="写下沟通内容、修改意见或交付说明"></textarea>
        <button type="submit">发送留言</button>
        <p class="message" id="publicCommentMessage"></p>
      </form>
    </section>
  `;
}

function quickReplyTexts() {
  if (state.user.role === "designer") {
    return ["已收到", "需要补充尺寸", "请提供高清图", "初稿已上传", "需要修改", "已完成"];
  }
  if (state.user.role === "service") {
    return ["客户已确认", "客户需要修改", "资料已补充", "请先出初稿", "订单信息已核对", "可以交付"];
  }
  return ["已收到", "请补充资料", "初稿已上传", "客户已确认", "需要修改", "已完成"];
}

function renderPublicComment(comment) {
  const canDelete = comment.authorId === state.user.id;
  return `
    <article class="message-card ${comment.authorRole || "unknown"}" data-comment-id="${escapeAttr(comment.id || "")}">
      <div class="message-head">
        <div>
          <strong>${escapeHtml(comment.authorName || "成员")}</strong>
          <span>${roleLabels[comment.authorRole] || "成员"}</span>
        </div>
        <div class="message-actions">
          <time>${formatDateTime(comment.createdAt)}</time>
          ${canDelete ? `<button class="message-delete" type="button" data-delete-comment-id="${escapeAttr(comment.id || "")}">删除</button>` : ""}
        </div>
      </div>
      <p>${escapeHtml(comment.text || "")}</p>
    </article>
  `;
}

function bindPublicCommentEvents() {
  const form = document.querySelector("#publicCommentForm");
  if (!form) return;
  document.querySelector(".public-comments .comment-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-delete-comment-id]");
    if (!button) return;
    await deletePublicComment(button.dataset.deleteCommentId);
  });

  form.querySelector(".quick-replies")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-quick-reply]");
    if (!button) return;
    const textarea = form.querySelector("textarea[name='text']");
    textarea.value = button.dataset.quickReply;
    textarea.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#publicCommentMessage");
    const button = form.querySelector('button[type="submit"]');
    const text = new FormData(form).get("text");
    const selectedTaskId = state.selectedTaskId;
    const modalWasOpen = Boolean(state.taskDetailModalOpen);
    message.textContent = "";
    button.disabled = true;
    try {
      const result = await api(`/api/tasks/${selectedTaskId}/comments`, { method: "POST", body: { text } });
      state.selectedTaskId = selectedTaskId;
      state.taskDetailModalOpen = modalWasOpen;
      form.reset();
      if (result.comment && typeof mergeRealtimeComment === "function") {
        mergeRealtimeComment(result.comment);
        appendRealtimeCommentToOpenList(result.comment, { forceScroll: true });
      } else {
        await loadData();
        state.selectedTaskId = selectedTaskId;
        state.taskDetailModalOpen = modalWasOpen;
        render();
      }
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}


async function deletePublicComment(commentId) {
  if (!commentId || !state.selectedTaskId) return;
  const confirmed = window.confirm("确认删除这条留言？");
  if (!confirmed) return;
  await api(`/api/tasks/${state.selectedTaskId}/comments/${commentId}`, { method: "DELETE" });
  if (typeof removeRealtimeComment === "function") {
    removeRealtimeComment(state.selectedTaskId, commentId);
  } else {
    await loadData();
    render();
  }
}
