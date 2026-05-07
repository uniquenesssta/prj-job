# SQLite 数据分层

当前运行数据拆成两个 SQLite 数据库文件：

```text
data/
|-- app.db
|-- operation.db
|-- uploads/
|-- archives/
`-- operation-logs/
```

## app.db：核心业务库

`app.db` 保存系统日常业务必须读取和修改的数据，不把任务、附件、留言拆到多个数据库中。

- `users`：用户账号
- `departments`：部门
- `permissions`：权限点
- `role_permissions`：角色权限
- `tasks`：任务主信息和当前归档状态
- `task_statuses`：任务状态字典
- `task_field_definitions`：任务字段定义
- `files`：附件记录，真实文件仍保存在 `data/uploads/`
- `task_attachments`：任务和附件的对应关系
- `comments`：公开留言
- `personal_notes`：个人备注
- `archive_records`：任务归档记录，包含归档路径、压缩包路径、归档人、任务快照、文件数、留言数

## operation.db：操作、维护和日志归档库

`operation.db` 保存系统流水类数据，不参与任务池核心查询。

- `operation_logs`：用户关键操作记录，例如新建任务、修改任务、上传文件、留言、写个人备注
- `maintenance_records`：维护记录，例如数据库拆分、备份、检查、日志导出
- `log_archive_records`：每日 TXT 日志导出的归档记录

## operation-logs

`data/operation-logs/` 是每日 TXT 日志导出目录。路径来自 `config/config.json` 的 `operationLogDir`，未配置时默认使用 `data/operation-logs`。

每日 0 点会从 `operation.db` 读取前一天的 `operation_logs` 和 `maintenance_records`，导出为：

```text
data/operation-logs/YYYY-MM-DD-operation-log.txt
```

导出完成后，会在 `operation.db.log_archive_records` 中记录导出日期、文件路径、记录数量和导出时间。

## 迁移说明

旧版本如果曾经把 `operation_logs` 或 `maintenance_records` 放在 `app.db` 中，启动时会迁移到 `operation.db`。旧版本如果曾经把 `archive_records` 放在 `operation.db` 中，启动时会迁移回 `app.db`。
