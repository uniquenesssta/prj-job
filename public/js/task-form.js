function renderTaskForm() {
  const designers = state.users.filter((user) => user.role === "designer");
  return `
    <form class="form" id="taskForm">
      <label><span>任务名称</span><input name="title" required placeholder="例如：详情页主图精修" /></label>
      <label><span>任务说明</span><textarea name="description" rows="4" placeholder="尺寸、风格、文案、参考图、交付格式"></textarea></label>
      <div class="form-grid">
        <label><span>微信号</span><input name="wechat" placeholder="客户微信号" /></label>
        <label><span>订单号</span><input name="orderNo" placeholder="订单号" /></label>
      </div>
      <label><span>淘宝ID</span><input name="taobaoId" placeholder="淘宝买家ID或店铺ID" /></label>
      <div class="form-grid">
        <label>
          <span>设计师</span>
          <select name="assigneeId" required>${designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select>
        </label>
        <label>
          <span>优先级</span>
          <select name="priority">
            <option value="normal">普通</option>
            <option value="high">重要</option>
            <option value="urgent">加急</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
      <label><span>截止日期</span><input name="dueDate" type="date" /></label>
      <button type="submit">创建并派单</button>
      <p class="message" id="taskMessage"></p>
    </form>
  `;
}

function renderPersonalTaskModal() {
  if (!state.personalTaskModalOpen) return "";
  return `
    <div class="modal-backdrop" id="personalTaskBackdrop">
      <section class="modal-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Personal Task</p>
            <h2>新增个人任务</h2>
          </div>
          <button class="button secondary" id="closePersonalTaskModal" type="button">关闭</button>
        </div>
        <form class="form" id="personalTaskForm">
          <label><span>任务名称</span><input name="title" required placeholder="例如：整理素材、练习版式、内部优化" /></label>
          <label><span>任务说明</span><textarea name="description" rows="4" placeholder="写清楚自己要做什么"></textarea></label>
          <div class="form-grid">
            <label>
              <span>优先级</span>
              <select name="priority">
                <option value="normal">普通</option>
                <option value="high">重要</option>
                <option value="urgent">加急</option>
                <option value="low">低</option>
              </select>
            </label>
            <label><span>截止日期</span><input name="dueDate" type="date" /></label>
          </div>
          <label><span>备注</span><textarea name="remark" rows="3" placeholder="记录想法、检查点或内部说明"></textarea></label>
          <button type="submit">创建个人任务</button>
          <p class="message" id="personalTaskMessage"></p>
        </form>
      </section>
    </div>
  `;
}

function bindTaskForm() {
  const form = document.querySelector("#taskForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#taskMessage");
    message.textContent = "";
    try {
      await api("/api/tasks", { method: "POST", body: Object.fromEntries(new FormData(form).entries()) });
      form.reset();
      message.style.color = "#2f9563";
      message.textContent = "任务已创建并派给设计师。";
      await loadData();
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  });
}
