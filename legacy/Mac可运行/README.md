# Mac 启动说明

优先双击 `start-server.command` 启动。

如果 macOS 提示没有权限运行，打开“终端”，进入本文件夹后执行一次：

```sh
chmod +x start-server.command
```

之后再双击 `start-server.command`。

默认地址：

- 本机访问：`http://localhost:3000`
- 局域网访问：启动窗口里会显示类似 `http://192.168.x.x:3000` 的地址

Mac 需要先安装 Node.js。没有安装时可到 `https://nodejs.org/` 下载 LTS 版本。

## 数据位置

本目录的 `config.json` 已经指向根目录的 `data` 文件夹：

- `../data/db.json`：账号、任务、附件记录
- `../data/comments.json`：任务留言记录
- `../data/uploads`：上传的设计稿和资料
- `../data/archives`：归档文件夹和压缩包

## 默认账号

- 管理员：`admin` / `admin123`
- 客服：`kefu` / `service123`
- 成员：`aming` / `design123`
- 成员：`ayan` / `design123`
- 成员：`aqi` / `design123`

管理员可以在页面里新增和修改账号。
