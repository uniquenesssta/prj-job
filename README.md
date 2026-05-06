# 设计任务执行台

这是维护版目录结构：代码只有一份，Windows 和 Mac 只是启动方式不同。

```text
Prj-job/
|-- src/                 后端代码
|   |-- server.js
|   |-- config.js
|   |-- http-utils.js
|   |-- router.js
|   |-- storage.js
|   |-- auth.js
|   |-- tasks.js
|   |-- files.js
|   |-- upload-queue.js
|   |-- archive.js
|   |-- events.js
|   `-- static.js
|-- public/              前端页面
|   |-- index.html
|   |-- app.css
|   |-- app.js
|   `-- js/
|       |-- pages/
|       `-- components/
|-- config/              配置文件
|   `-- config.json
|-- data/                运行数据
|   |-- db.json
|   |-- comments.json
|   |-- uploads/
|   `-- archives/
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

## 重点备份

日常备份优先备份：

- `data`
- `config/config.json`

`src` 和 `public` 是程序代码，修改功能时主要改这两个目录。
