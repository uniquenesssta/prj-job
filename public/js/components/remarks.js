function renderRemark(task) {
  return `
    <section class="detail-card remark-card">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Remark</p>
          <h2>备注</h2>
        </div>
      </div>
      <form class="comment-form" id="remarkForm">
        <textarea name="remark" rows="5" placeholder="记录内部说明、检查点或客户补充">${escapeHtml(task.remark || "")}</textarea>
        <button type="submit">保存备注</button>
      </form>
    </section>
  `;
}
