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
        <textarea name="text" placeholder="写下沟通内容、修改意见或交付说明"></textarea>
        <button type="submit">发送留言</button>
        <p class="message" id="publicCommentMessage"></p>
      </form>
    </section>
  `;
}

function renderPublicComment(comment) {
  return `
    <article class="message-card ${comment.authorRole || "unknown"}">
      <div class="message-head">
        <div>
          <strong>${escapeHtml(comment.authorName || "成员")}</strong>
          <span>${roleLabels[comment.authorRole] || "成员"}</span>
        </div>
        <time>${formatDateTime(comment.createdAt)}</time>
      </div>
      <p>${escapeHtml(comment.text || "")}</p>
    </article>
  `;
}

function bindPublicCommentEvents() {
  const form = document.querySelector("#publicCommentForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#publicCommentMessage");
    const button = form.querySelector("button");
    const text = new FormData(form).get("text");
    message.textContent = "";
    button.disabled = true;
    try {
      await api(`/api/tasks/${state.selectedTaskId}/comments`, { method: "POST", body: { text } });
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
