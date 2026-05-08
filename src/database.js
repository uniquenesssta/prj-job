const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  ARCHIVE_DIR,
  DATA_DIR,
  DB_FILE,
  OPERATION_DB_FILE,
  OPERATION_LOG_DIR,
  REMARK_IMAGE_DIR,
  UPLOAD_DIR,
} = require("./config");

let sqlite = null;
let operationSqlite = null;

function ensureDatabase() {
  ensureDirectory(DATA_DIR);
  ensureDirectory(UPLOAD_DIR);
  ensureDirectory(REMARK_IMAGE_DIR);
  ensureDirectory(ARCHIVE_DIR);
  ensureDirectory(OPERATION_LOG_DIR);
  const db = getDatabase();
  createSchema(db);
  migrateUserOrganizationFields(db);
  migrateDepartmentFields(db);
  migrateTaskDesignFields(db);
  migrateTaskDeletionFields(db);
  migrateFileUsageField(db);
  migratePersonalNotesSchema(db);
  seedReferenceDataV2(db);
  createIndexes(db);
  const operationDb = getOperationDatabase();
  createOperationSchema(operationDb);
  createOperationIndexes(operationDb);
  migrateOperationDataToOperationDatabase(db, operationDb);
  migrateArchiveRecordsToAppDatabase(db, operationDb);
  removeOperationTablesFromAppDatabase(db);
  removeBusinessArchiveTableFromOperationDatabase(operationDb);
  recordOperationDatabaseSplit(operationDb);
  return db;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getDatabase() {
  if (!sqlite) {
    sqlite = new DatabaseSync(DB_FILE);
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
  return sqlite;
}

function getOperationDatabase() {
  if (!operationSqlite) {
    operationSqlite = new DatabaseSync(OPERATION_DB_FILE);
    operationSqlite.exec("PRAGMA journal_mode = WAL");
    operationSqlite.exec("PRAGMA foreign_keys = ON");
  }
  return operationSqlite;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      departmentId TEXT NOT NULL DEFAULT '',
      passwordHash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      defaultRole TEXT NOT NULL DEFAULT 'designer',
      customRoleName TEXT NOT NULL DEFAULT '',
      permissionPreset TEXT NOT NULL DEFAULT '{}',
      parentId TEXT NOT NULL DEFAULT '',
      parentDepartmentIds TEXT NOT NULL DEFAULT '[]',
      managerId TEXT NOT NULL DEFAULT '',
      allowViewOwnDepartmentTasks INTEGER NOT NULL DEFAULT 0,
      allowViewChildDepartmentTasks INTEGER NOT NULL DEFAULT 0,
      childDepartmentScope TEXT NOT NULL DEFAULT '[]',
      disabledAt TEXT NOT NULL DEFAULT '',
      deletedAt TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      groupName TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT NOT NULL,
      permissionId TEXT NOT NULL,
      PRIMARY KEY (role, permissionId)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      wechat TEXT NOT NULL DEFAULT '',
      orderNo TEXT NOT NULL DEFAULT '',
      taobaoId TEXT NOT NULL DEFAULT '',
      taskType TEXT NOT NULL DEFAULT '',
      sizeSpec TEXT NOT NULL DEFAULT '',
      deliverFormat TEXT NOT NULL DEFAULT '',
      customerRequirement TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      remarkRecords TEXT NOT NULL DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'public',
      creatorId TEXT NOT NULL,
      assigneeId TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'todo',
      progress INTEGER NOT NULL DEFAULT 0,
      dueDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      archivedAt TEXT NOT NULL DEFAULT '',
      archiveZipPath TEXT NOT NULL DEFAULT '',
      deletedAt TEXT NOT NULL DEFAULT '',
      deletedBy TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS task_statuses (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS task_field_definitions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fieldGroup TEXT NOT NULL,
      inputType TEXT NOT NULL DEFAULT 'text',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      required INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      originalName TEXT NOT NULL,
      storedName TEXT NOT NULL,
      relativePath TEXT NOT NULL,
      folderName TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL DEFAULT 'application/octet-stream',
      storageArea TEXT NOT NULL DEFAULT 'upload',
      usage TEXT NOT NULL DEFAULT 'attachment',
      uploadedBy TEXT NOT NULL,
      uploadedByName TEXT NOT NULL DEFAULT '',
      uploadedByRole TEXT NOT NULL DEFAULT '',
      uploadedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_attachments (
      taskId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (taskId, fileId)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      authorId TEXT NOT NULL,
      text TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_notes (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      userId TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      imageFileIds TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archive_records (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      archivePath TEXT NOT NULL DEFAULT '',
      zipPath TEXT NOT NULL DEFAULT '',
      archivedBy TEXT NOT NULL DEFAULT '',
      archivedByName TEXT NOT NULL DEFAULT '',
      archivedAt TEXT NOT NULL,
      restoredAt TEXT NOT NULL DEFAULT '',
      taskSnapshot TEXT NOT NULL DEFAULT '{}',
      fileCount INTEGER NOT NULL DEFAULT 0,
      commentCount INTEGER NOT NULL DEFAULT 0
    );

  `);
}

function createOperationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      userName TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      targetType TEXT NOT NULL DEFAULT '',
      targetId TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_archive_records (
      id TEXT PRIMARY KEY,
      archiveDate TEXT NOT NULL UNIQUE,
      archivePath TEXT NOT NULL DEFAULT '',
      recordCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      detail TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    );
  `);
}

function migrateUserOrganizationFields(db) {
  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("departmentId")) db.exec("ALTER TABLE users ADD COLUMN departmentId TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("customPermissions")) db.exec("ALTER TABLE users ADD COLUMN customPermissions TEXT NOT NULL DEFAULT '{}'");
  if (!columns.includes("disabledAt")) db.exec("ALTER TABLE users ADD COLUMN disabledAt TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("deletedAt")) db.exec("ALTER TABLE users ADD COLUMN deletedAt TEXT NOT NULL DEFAULT ''");
}

function migrateDepartmentFields(db) {
  const columns = db.prepare("PRAGMA table_info(departments)").all().map((column) => column.name);
  if (!columns.includes("defaultRole")) db.exec("ALTER TABLE departments ADD COLUMN defaultRole TEXT NOT NULL DEFAULT 'designer'");
  if (!columns.includes("customRoleName")) db.exec("ALTER TABLE departments ADD COLUMN customRoleName TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("permissionPreset")) db.exec("ALTER TABLE departments ADD COLUMN permissionPreset TEXT NOT NULL DEFAULT '{}'");
  if (!columns.includes("parentId")) db.exec("ALTER TABLE departments ADD COLUMN parentId TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("parentDepartmentIds")) db.exec("ALTER TABLE departments ADD COLUMN parentDepartmentIds TEXT NOT NULL DEFAULT '[]'");
  if (!columns.includes("managerId")) db.exec("ALTER TABLE departments ADD COLUMN managerId TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("allowViewOwnDepartmentTasks")) db.exec("ALTER TABLE departments ADD COLUMN allowViewOwnDepartmentTasks INTEGER NOT NULL DEFAULT 0");
  if (!columns.includes("allowViewChildDepartmentTasks")) db.exec("ALTER TABLE departments ADD COLUMN allowViewChildDepartmentTasks INTEGER NOT NULL DEFAULT 0");
  if (!columns.includes("childDepartmentScope")) db.exec("ALTER TABLE departments ADD COLUMN childDepartmentScope TEXT NOT NULL DEFAULT '[]'");
  if (!columns.includes("disabledAt")) db.exec("ALTER TABLE departments ADD COLUMN disabledAt TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("deletedAt")) db.exec("ALTER TABLE departments ADD COLUMN deletedAt TEXT NOT NULL DEFAULT ''");
  db.exec("UPDATE departments SET parentDepartmentIds = CASE WHEN parentDepartmentIds = '[]' AND parentId != '' THEN json_array(parentId) ELSE parentDepartmentIds END");
}

function migrateFileUsageField(db) {
  const columns = db.prepare("PRAGMA table_info(files)").all().map((column) => column.name);
  if (!columns.includes("usage")) db.exec("ALTER TABLE files ADD COLUMN usage TEXT NOT NULL DEFAULT 'other'");
  if (!columns.includes("storageArea")) db.exec("ALTER TABLE files ADD COLUMN storageArea TEXT NOT NULL DEFAULT 'upload'");
}

function migrateTaskDesignFields(db) {
  const columns = db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  const fields = [
    ["taskType", "TEXT NOT NULL DEFAULT ''"],
    ["sizeSpec", "TEXT NOT NULL DEFAULT ''"],
    ["deliverFormat", "TEXT NOT NULL DEFAULT ''"],
    ["customerRequirement", "TEXT NOT NULL DEFAULT ''"],
  ];
  fields.forEach(([name, definition]) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
  });
}

function migrateTaskDeletionFields(db) {
  const columns = db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (!columns.includes("deletedAt")) db.exec("ALTER TABLE tasks ADD COLUMN deletedAt TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("deletedBy")) db.exec("ALTER TABLE tasks ADD COLUMN deletedBy TEXT NOT NULL DEFAULT ''");
}

function migratePersonalNotesSchema(db) {
  const columns = db.prepare("PRAGMA table_info(personal_notes)").all().map((column) => column.name);
  const indexes = db.prepare("PRAGMA index_list(personal_notes)").all();
  const hasOldUniqueConstraint = indexes.some((index) => index.unique && index.origin === "u");
  const needsMigration = hasOldUniqueConstraint || !columns.includes("imageFileIds") || !columns.includes("createdAt");
  if (!needsMigration) return;

  db.exec("ALTER TABLE personal_notes RENAME TO personal_notes_legacy");
  db.exec(`
    CREATE TABLE personal_notes (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      userId TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      imageFileIds TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );
  `);

  const legacyColumns = db.prepare("PRAGMA table_info(personal_notes_legacy)").all().map((column) => column.name);
  const legacyRows = db.prepare("SELECT * FROM personal_notes_legacy").all();
  const insert = db.prepare("INSERT INTO personal_notes (id, taskId, userId, text, imageFileIds, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
  legacyRows.forEach((row) => {
    insert.run(
      row.id || createDatabaseId("note"),
      row.taskId || row.task_id || "",
      row.userId || row.user_id || "",
      row.text || "",
      legacyColumns.includes("imageFileIds") ? row.imageFileIds || "[]" : "[]",
      row.createdAt || row.updatedAt || row.updated_at || new Date().toISOString()
    );
  });
  db.exec("DROP TABLE personal_notes_legacy");
}

function createIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_department ON users(departmentId);
    CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parentId);
    CREATE INDEX IF NOT EXISTS idx_departments_manager ON departments(managerId);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigneeId);
    CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creatorId);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(dueDate);
    CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON tasks(visibility);
    CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deletedAt);
    CREATE INDEX IF NOT EXISTS idx_files_task ON files(taskId);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(taskId);
    CREATE INDEX IF NOT EXISTS idx_personal_notes_task_user ON personal_notes(taskId, userId);
    CREATE INDEX IF NOT EXISTS idx_archive_records_task ON archive_records(taskId);
  `);
}

function createOperationIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_operation_logs_target ON operation_logs(targetType, targetId);
    CREATE INDEX IF NOT EXISTS idx_maintenance_records_created ON maintenance_records(createdAt);
    CREATE INDEX IF NOT EXISTS idx_log_archive_records_date ON log_archive_records(archiveDate);
  `);
}

function migrateOperationDataToOperationDatabase(appDb, operationDb) {
  const tableNames = appDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  if (tableNames.includes("operation_logs")) {
    const rows = appDb.prepare("SELECT * FROM operation_logs").all();
    const insert = operationDb.prepare(`
      INSERT OR IGNORE INTO operation_logs (id, userId, userName, action, targetType, targetId, detail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rows.forEach((row) => insert.run(row.id, row.userId || "", row.userName || "", row.action || "", row.targetType || "", row.targetId || "", row.detail || "", row.createdAt || new Date().toISOString()));
  }
  if (tableNames.includes("maintenance_records")) {
    const rows = appDb.prepare("SELECT * FROM maintenance_records").all();
    const insert = operationDb.prepare(`
      INSERT OR IGNORE INTO maintenance_records (id, action, status, detail, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    rows.forEach((row) => insert.run(row.id, row.action || "", row.status || "ok", row.detail || "", row.createdAt || new Date().toISOString()));
  }
}

function migrateArchiveRecordsToAppDatabase(appDb, operationDb) {
  const operationTables = operationDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  if (!operationTables.includes("archive_records")) return;
  const rows = operationDb.prepare("SELECT * FROM archive_records").all();
  const insert = appDb.prepare(`
    INSERT OR IGNORE INTO archive_records (
      id, taskId, archivePath, zipPath, archivedBy, archivedByName, archivedAt,
      restoredAt, taskSnapshot, fileCount, commentCount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((row) => insert.run(
    row.id || createDatabaseId("archive"),
    row.taskId || "",
    row.archivePath || "",
    row.zipPath || "",
    row.archivedBy || "",
    row.archivedByName || "",
    row.archivedAt || new Date().toISOString(),
    row.restoredAt || "",
    row.taskSnapshot || "{}",
    Number(row.fileCount || 0),
    Number(row.commentCount || 0)
  ));
}

function removeOperationTablesFromAppDatabase(db) {
  db.exec(`
    DROP TABLE IF EXISTS operation_logs;
    DROP TABLE IF EXISTS maintenance_records;
  `);
}

function removeBusinessArchiveTableFromOperationDatabase(db) {
  db.exec("DROP TABLE IF EXISTS archive_records;");
}

function recordOperationDatabaseSplit(db) {
  db.prepare(`
    INSERT OR IGNORE INTO maintenance_records (id, action, status, detail, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    "maint_operation_db_split",
    "operation_db_split",
    "ok",
    "操作记录、维护记录已拆分到 operation.db；任务归档记录保留在 app.db",
    new Date().toISOString()
  );
}

function seedReferenceData(db) {
  const now = new Date().toISOString();
  const departments = [
    ["dept_admin", "管理部", "系统管理、账号、归档和维护"],
    ["dept_service", "客服部", "客户需求录入和沟通跟进"],
    ["dept_design", "设计部", "设计执行、交付和个人任务"],
  ];
  const insertDepartment = db.prepare(`
    INSERT OR IGNORE INTO departments (id, name, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  departments.forEach((item) => insertDepartment.run(item[0], item[1], item[2], now, now));

  const permissions = [
    ["perm_users_manage", "users.manage", "账号管理", "用户、部门、权限"],
    ["perm_tasks_read_all", "tasks.read_all", "查看全部任务", "任务"],
    ["perm_tasks_create_public", "tasks.create_public", "创建公共任务", "任务"],
    ["perm_tasks_create_private", "tasks.create_private", "创建个人任务", "任务"],
    ["perm_tasks_edit_brief", "tasks.edit_brief", "修改任务信息", "任务"],
    ["perm_tasks_update_status", "tasks.update_status", "更新任务状态", "任务"],
    ["perm_files_upload", "files.upload", "上传附件", "附件"],
    ["perm_files_download", "files.download", "下载附件", "附件"],
    ["perm_comments_write", "comments.write", "写公开留言", "留言"],
    ["perm_notes_write", "notes.write", "写个人备注", "个人备注"],
    ["perm_archives_manage", "archives.manage", "归档和恢复任务", "归档"],
    ["perm_system_maintain", "system.maintain", "系统维护记录", "维护"],
  ];
  const insertPermission = db.prepare(`
    INSERT OR IGNORE INTO permissions (id, code, name, groupName)
    VALUES (?, ?, ?, ?)
  `);
  permissions.forEach((item) => insertPermission.run(item[0], item[1], item[2], item[3]));

  const rolePermissionCodes = {
    owner: permissions.map((item) => item[1]),
    service: ["tasks.create_public", "tasks.edit_brief", "files.upload", "files.download", "comments.write", "notes.write"],
    designer: ["tasks.create_private", "tasks.update_status", "files.upload", "files.download", "comments.write", "notes.write"],
  };
  const permissionRows = db.prepare("SELECT id, code FROM permissions").all();
  const permissionByCode = new Map(permissionRows.map((row) => [row.code, row.id]));
  const insertRolePermission = db.prepare("INSERT OR IGNORE INTO role_permissions (role, permissionId) VALUES (?, ?)");
  Object.entries(rolePermissionCodes).forEach(([role, codes]) => {
    codes.forEach((code) => {
      const permissionId = permissionByCode.get(code);
      if (permissionId) insertRolePermission.run(role, permissionId);
    });
  });

  const statuses = [
    ["todo", "待开始", 10, "gray"],
    ["doing", "进行中", 20, "blue"],
    ["review", "待审核", 30, "violet"],
    ["blocked", "卡住", 40, "red"],
    ["done", "已完成", 50, "green"],
  ];
  const insertStatus = db.prepare("INSERT OR IGNORE INTO task_statuses (code, name, sortOrder, color) VALUES (?, ?, ?, ?)");
  statuses.forEach((item) => insertStatus.run(item[0], item[1], item[2], item[3]));

  const fields = [
    ["title", "任务标题", "基础信息", "text", 10, 1],
    ["description", "任务说明", "基础信息", "textarea", 20, 0],
    ["wechat", "微信号", "订单信息", "text", 30, 0],
    ["orderNo", "订单号", "订单信息", "text", 40, 0],
    ["taobaoId", "淘宝ID", "订单信息", "text", 50, 0],
    ["taskType", "任务类型", "设计需求", "select", 60, 0],
    ["sizeSpec", "尺寸规格", "设计需求", "text", 70, 0],
    ["deliverFormat", "交付格式", "设计需求", "select", 80, 0],
    ["customerRequirement", "客户原始需求", "设计需求", "textarea", 90, 0],
    ["priority", "优先级", "排期", "select", 100, 0],
    ["dueDate", "截止日期", "排期", "date", 110, 0],
    ["assigneeId", "负责设计师", "排期", "user", 120, 1],
  ];
  const insertField = db.prepare(`
    INSERT OR IGNORE INTO task_field_definitions (code, name, fieldGroup, inputType, sortOrder, required)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  fields.forEach((item) => insertField.run(item[0], item[1], item[2], item[3], item[4], item[5]));
}

function seedReferenceDataV2(db) {
  const now = new Date().toISOString();
  const departments = [
    ["dept_admin", "管理部", "系统管理、账号、归档和维护", "owner", ["users.manage", "departments.manage", "permissions.manage", "archives.manage", "system.maintain", "operation_logs.view", "operation_logs.export", "views.other_designers", "views.other_services"]],
    ["dept_service", "客服部", "客户需求录入和沟通跟进", "service", ["tasks.create_public", "tasks.edit_brief", "files.upload", "comments.write"]],
    ["dept_design", "设计部", "设计执行、交付和个人任务", "designer", ["tasks.create_private", "tasks.update_status", "files.upload", "notes.write"]],
  ];
  const insertDepartment = db.prepare(`
    INSERT OR IGNORE INTO departments (
      id, name, description, defaultRole, permissionPreset, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateDepartment = db.prepare(`
    UPDATE departments
    SET defaultRole = ?,
        permissionPreset = CASE WHEN permissionPreset = '{}' THEN ? ELSE permissionPreset END
    WHERE id = ?
  `);
  departments.forEach((item) => {
    const preset = JSON.stringify({ extra: item[4], disabled: [] });
    insertDepartment.run(item[0], item[1], item[2], item[3], preset, now, now);
    updateDepartment.run(item[3], preset, item[0]);
  });

  const permissions = [
    ["perm_users_manage", "users.manage", "账号管理", "用户、部门、权限"],
    ["perm_departments_manage", "departments.manage", "部门管理", "用户、部门、权限"],
    ["perm_permissions_manage", "permissions.manage", "权限设置", "用户、部门、权限"],
    ["perm_tasks_read_all", "tasks.read_all", "查看全部任务", "任务"],
    ["perm_tasks_create_public", "tasks.create_public", "创建公共任务", "任务"],
    ["perm_tasks_create_private", "tasks.create_private", "创建个人任务", "任务"],
    ["perm_tasks_edit_brief", "tasks.edit_brief", "修改任务信息", "任务"],
    ["perm_tasks_update_status", "tasks.update_status", "更新任务状态", "任务"],
    ["perm_tasks_delete", "tasks.delete", "删除任务", "任务"],
    ["perm_files_upload", "files.upload", "上传附件", "附件"],
    ["perm_files_download", "files.download", "下载附件", "附件"],
    ["perm_files_delete_own", "files.delete_own", "删除自己上传的文件", "附件"],
    ["perm_files_delete_any", "files.delete_any", "删除任意文件", "附件"],
    ["perm_comments_write", "comments.write", "写公开留言", "留言"],
    ["perm_notes_write", "notes.write", "写个人备注", "个人备注"],
    ["perm_archives_manage", "archives.manage", "归档和恢复任务", "归档"],
    ["perm_system_maintain", "system.maintain", "系统维护", "维护"],
    ["perm_operation_logs_view", "operation_logs.view", "查看操作记录", "操作记录"],
    ["perm_operation_logs_export", "operation_logs.export", "导出操作记录", "操作记录"],
    ["perm_views_other_designers", "views.other_designers", "查看其他设计师", "视图权限"],
    ["perm_views_other_services", "views.other_services", "查看其他客服", "视图权限"],
  ];
  const insertPermission = db.prepare(`
    INSERT OR IGNORE INTO permissions (id, code, name, groupName)
    VALUES (?, ?, ?, ?)
  `);
  permissions.forEach((item) => insertPermission.run(item[0], item[1], item[2], item[3]));

  const rolePermissionCodes = {
    owner: permissions.map((item) => item[1]),
    service: ["tasks.create_public", "tasks.edit_brief", "files.upload", "files.download", "comments.write", "notes.write"],
    designer: ["tasks.create_private", "tasks.update_status", "files.upload", "files.download", "comments.write", "notes.write"],
  };
  const permissionRows = db.prepare("SELECT id, code FROM permissions").all();
  const permissionByCode = new Map(permissionRows.map((row) => [row.code, row.id]));
  const insertRolePermission = db.prepare("INSERT OR IGNORE INTO role_permissions (role, permissionId) VALUES (?, ?)");
  Object.entries(rolePermissionCodes).forEach(([role, codes]) => {
    codes.forEach((code) => {
      const permissionId = permissionByCode.get(code);
      if (permissionId) insertRolePermission.run(role, permissionId);
    });
  });

  const statuses = [
    ["todo", "待开始", 10, "gray"],
    ["doing", "进行中", 20, "blue"],
    ["review", "待审核", 30, "violet"],
    ["blocked", "卡住", 40, "red"],
    ["done", "已完成", 50, "green"],
  ];
  const insertStatus = db.prepare("INSERT OR IGNORE INTO task_statuses (code, name, sortOrder, color) VALUES (?, ?, ?, ?)");
  statuses.forEach((item) => insertStatus.run(item[0], item[1], item[2], item[3]));

  const fields = [
    ["title", "任务标题", "基础信息", "text", 10, 1],
    ["description", "任务说明", "基础信息", "textarea", 20, 0],
    ["wechat", "微信号", "订单信息", "text", 30, 0],
    ["orderNo", "订单号", "订单信息", "text", 40, 0],
    ["taobaoId", "淘宝ID", "订单信息", "text", 50, 0],
    ["taskType", "任务类型", "设计需求", "select", 60, 0],
    ["sizeSpec", "尺寸规格", "设计需求", "text", 70, 0],
    ["deliverFormat", "交付格式", "设计需求", "select", 80, 0],
    ["customerRequirement", "客户原始需求", "设计需求", "textarea", 90, 0],
    ["priority", "优先级", "排期", "select", 100, 0],
    ["dueDate", "截止日期", "排期", "date", 110, 0],
    ["assigneeId", "负责设计师", "排期", "user", 120, 1],
  ];
  const insertField = db.prepare(`
    INSERT OR IGNORE INTO task_field_definitions (code, name, fieldGroup, inputType, sortOrder, required)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  fields.forEach((item) => insertField.run(item[0], item[1], item[2], item[3], item[4], item[5]));
}

function createDatabaseId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function isDatabaseEmpty(db = getDatabase()) {
  return Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count) === 0;
}

function clearApplicationData(db = getDatabase()) {
  db.exec("DELETE FROM personal_notes; DELETE FROM comments; DELETE FROM task_attachments; DELETE FROM files; DELETE FROM tasks; DELETE FROM users;");
}

function clearCoreData(db = getDatabase()) {
  db.exec("DELETE FROM task_attachments; DELETE FROM files; DELETE FROM tasks; DELETE FROM users;");
}

function runInTransaction(callback, db = getDatabase()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
}
}

module.exports = {
  clearApplicationData,
  clearCoreData,
  createDatabaseId,
  ensureDatabase,
  getDatabase,
  getOperationDatabase,
  isDatabaseEmpty,
  runInTransaction,
};
