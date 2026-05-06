# Windows 启动说明

双击 `start-server.bat`，看到启动信息后不要关闭窗口。

默认地址：

- 本机访问：`http://localhost:3000`
- 局域网访问：启动窗口里会显示类似 `http://192.168.x.x:3000` 的地址

如果其他电脑打不开，通常是 Windows 防火墙拦截了端口。建议在高级防火墙里新增入站规则：

- 端口：TCP 3000
- 网络：专用网络
- 名称：设计任务执行台 3000

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
