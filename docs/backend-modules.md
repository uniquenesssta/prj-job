# 后端模块说明

后端入口是 `src/server.js`，业务代码已经拆分为多个模块。新增功能时优先放入对应模块，避免重新堆回入口文件。

- `server.js`：启动 HTTP 服务，打印访问地址和数据目录。
- `router.js`：统一分发 API 和静态页面请求。
- `config.js`：读取 `config/config.json`，解析数据、上传、备注图片和归档目录。
- `database.js`：SQLite 连接、建表、索引和事务工具。
- `repositories/`：数据库读写层，负责 users、tasks、files、comments、personal_notes 的查询和写入。
- `storage.js`：兼容旧业务接口的门面，负责旧 JSON 迁移、默认数据、密码工具、任务数据组装。
- `permissions.js`：统一权限判断，不直接查询数据库。
- `auth.js`：登录、退出、当前用户、账号管理。
- `tasks.js`：任务列表、新建任务、修改任务、恢复归档任务。
- `comments.js`：公共任务留言。
- `notes.js`：个人备注接口，按当前登录用户读取和写入 `personal_notes`。
- `remarks.js`：设计师个人任务备注和备注图片。
- `files.js`：上传、下载、文件名和上传目录命名。
- `upload-queue.js`：全局上传队列，所有登录用户的上传按顺序处理。
- `archive.js`：已完成任务归档、单任务归档、zip 压缩。
- `events.js`：实时刷新事件推送。
- `static.js`：提供 `public` 里的前端页面和资源。
- `http-utils.js`：JSON 响应、错误响应、请求体读取、Cookie 解析。

运行数据结构：

```text
data/
|-- app.db
|-- uploads/
`-- archives/
```

旧的 `data/db.json` 和 `data/comments.json` 只作为迁移来源和历史备份保留，运行时以 `data/app.db` 为准。
