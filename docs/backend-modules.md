# 后端模块说明

后端已经拆成多个模块，入口仍然是 `src/server.js`。

- `server.js`：启动 HTTP 服务，打印访问地址。
- `router.js`：统一分发 API 和静态页面请求。
- `config.js`：读取 `config/config.json`，解析数据、上传和归档目录。
- `storage.js`：读写 `db.json`、`comments.json`，处理数据迁移和任务信息补全。
- `auth.js`：登录、退出、当前用户、账号管理和权限判断。
- `tasks.js`：任务列表、新建任务、公共/私有任务、备注、修改任务、恢复归档任务。
- `files.js`：上传、下载、文件名和上传目录命名。
- `upload-queue.js`：全局上传队列，所有登录用户的上传按顺序处理。
- `archive.js`：已完成任务归档、单任务归档、zip 压缩。
- `events.js`：实时刷新事件推送。
- `static.js`：提供 `public` 里的前端页面和资源。
- `http-utils.js`：JSON 响应、错误响应、请求体读取、Cookie 解析。

后续改功能时，优先找到对应模块再修改，避免把新逻辑重新堆回 `server.js`。
