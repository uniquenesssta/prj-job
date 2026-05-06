# 前端模块说明

前端入口是 `public/index.html`，脚本按顺序加载。

- `public/app.js`：启动入口，负责登录态检查、显示登录页或工作台。
- `public/js/state.js`：全局状态、标签文案、常用 DOM 节点。
- `public/js/api.js`：统一请求后端 API。
- `public/js/data.js`：加载用户、任务、实时刷新事件。
- `public/js/utils.js`：过滤任务、格式化时间和大小、HTML 转义。
- `public/js/account.js`：账号管理和管理员一键归档。
- `public/js/task-form.js`：客服新建任务表单。
- `public/js/render.js`：页面渲染调度。
- `public/js/events.js`：页面点击、提交、上传、备注等交互绑定。
- `public/js/pages/`：按页面拆分，包含设计师、客服、账号、归档页面。
- `public/js/components/`：共用组件，包含任务池、任务详情、备注、文件和顶部统计。

以后新增前端功能时，优先放到对应模块里；如果是一个新的大功能，可以新增一个 `public/js/*.js` 文件，并在 `public/index.html` 中按依赖顺序引入。
