# 设计任务执行台

这是一个局域网使用的设计任务管理系统，包含管理员、客服、设计师三个角色。项目已经整理为维护版结构：代码只有一份，Windows 和 Mac 只是启动方式不同。

```text
Prj-job/
|-- src/                 后端代码
|-- public/              前端页面
|-- config/              配置文件
|   `-- config.json
|-- data/                运行数据
|   |-- app.db           SQLite 数据库
|   |-- uploads/         上传文件和备注图片
|   `-- archives/        归档文件
|-- scripts/             启动脚本
|   |-- start-windows.bat
|   `-- start-mac.command
|-- docs/                使用说明
|-- legacy/              旧结构备份
|-- package.json
`-- README.md
```

## 启动

Windows：双击 `scripts/start-windows.bat`

Mac：双击或在终端运行 `scripts/start-mac.command`

也可以在根目录运行：

```sh
npm start
```

## 地址

- 本机访问：`http://localhost:3000`
- 局域网访问：启动窗口会显示类似 `http://192.168.x.x:3000` 的地址

## 数据

现在数据统一保存到 `data/app.db`，这是 SQLite 数据库。上传文件、备注图片和归档文件仍然保存在 `data/uploads` 和 `data/archives` 中。

旧的 `data/db.json` 和 `data/comments.json` 如果存在，只作为首次迁移来源或历史备份，不再作为运行数据使用。

## 备份

日常备份优先备份：

- `data/app.db`
- `data/uploads`
- `data/archives`
- `config/config.json`

`src` 和 `public` 是程序代码，修改功能时主要改这两个目录。
