function renderTaskForm(options = {}) {
  if (options.mode === "private") return renderPersonalTaskForm({ formId: "taskForm", messageId: "taskMessage" });
  const designers = state.users.filter((user) => user.role === "designer" && !user.disabledAt && !user.deletedAt);
  const noDesigner = designers.length === 0;
  return `
    <form class="form" id="taskForm">
      <input name="visibility" type="hidden" value="public" />
      <label><span>任务名称</span><input name="title" required placeholder="例如：详情页主图精修" /></label>
      <label><span>任务说明</span><textarea name="description" rows="4" placeholder="尺寸、风格、文案、参考图、交付格式"></textarea></label>
      <div class="form-grid">
        <label><span>微信号</span><input name="wechat" placeholder="客户微信号" /></label>
        <label><span>订单号</span><input name="orderNo" placeholder="订单号" /></label>
      </div>
      <label><span>淘宝ID</span><input name="taobaoId" placeholder="淘宝买家ID或店铺ID" /></label>
      <div class="form-grid">
        <label>
          <span>任务类型</span>
          <select name="taskType">
            <option value="">未选择</option>
            <option value="海报">海报</option>
            <option value="详情页">详情页</option>
            <option value="KT板">KT板</option>
            <option value="易拉宝">易拉宝</option>
            <option value="主图">主图</option>
            <option value="头像/LOGO">头像/LOGO</option>
            <option value="包装">包装</option>
            <option value="其他">其他</option>
          </select>
        </label>
        <label><span>尺寸规格</span><input name="sizeSpec" placeholder="例如：80x180cm / 1920x1080px" /></label>
      </div>
      <label>
        <span>交付格式</span>
        <select name="deliverFormat">
          <option value="">未选择</option>
          <option value="JPG">JPG</option>
          <option value="PNG">PNG</option>
          <option value="PSD">PSD</option>
          <option value="AI">AI</option>
          <option value="PDF">PDF</option>
          <option value="其他">其他</option>
        </select>
      </label>
      <label><span>客户原始需求</span><textarea name="customerRequirement" rows="3" placeholder="尽量保留客户原话、修改点、参考方向"></textarea></label>
      <div class="form-grid">
        <label>
          <span>设计师</span>
          <select name="assigneeId" required ${noDesigner ? "disabled" : ""}>
            ${noDesigner ? '<option value="">暂无可用设计师</option>' : designers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}
          </select>
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
      <button type="submit" ${noDesigner ? "disabled" : ""}>创建并派单</button>
      <p class="message" id="taskMessage">${noDesigner ? "请先创建或启用设计师账号。" : ""}</p>
    </form>
  `;
}

function renderPersonalTaskForm(options = {}) {
  const formId = options.formId || "personalTaskForm";
  const messageId = options.messageId || "personalTaskMessage";
  return `
    <form class="form" id="${formId}">
      <input name="visibility" type="hidden" value="private" />
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
      <p class="message" id="${messageId}"></p>
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
        ${renderPersonalTaskForm()}
      </section>
    </div>
  `;
}

function bindTaskForm(options = {}) {
  const form = document.querySelector("#taskForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#taskMessage");
    message.textContent = "";
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await api("/api/tasks", { method: "POST", body });
      form.reset();
      message.style.color = "#2f9563";
      message.textContent = body.visibility === "private" ? "个人任务已创建。" : "任务已创建并派给设计师。";
      if (typeof options.afterSuccess === "function") options.afterSuccess(body);
      await loadData();
      render();
    } catch (error) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  });
}
