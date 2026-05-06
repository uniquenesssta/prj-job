const fs = require("fs");
const crypto = require("crypto");
const {
  LEGACY_COMMENT_FILE,
  LEGACY_DB_FILE,
} = require("./config");
const {
  clearCoreData,
  ensureDatabase,
  isDatabaseEmpty,
  runInTransaction,
} = require("./database");
const { listComments, replaceComments } = require("./repositories/comments-repo");
const { insertFiles, listFiles } = require("./repositories/files-repo");
const { insertTasks, listTasks } = require("./repositories/tasks-repo");
const { insertUsers, listUsers } = require("./repositories/users-repo");

function ensureStorage() {
  const db = ensureDatabase();
  if (isDatabaseEmpty(db)) {
    writeDb(readLegacyDb() || seedDb());
    writeComments(readLegacyComments());
  }
  migrateDb();
}

function readLegacyDb() {
  if (!fs.existsSync(LEGACY_DB_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LEGACY_DB_FILE, "utf8"));
  } catch {
    return null;
  }
}

function readLegacyComments() {
  if (!fs.existsSync(LEGACY_COMMENT_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LEGACY_COMMENT_FILE, "utf8"));
  } catch {
    return [];
  }
}

function seedDb() {
  const now = new Date().toISOString();
  return {
    users: [
      makeUser("u_admin", "admin", "管理员", "owner", "admin123"),
      makeUser("u_service", "kefu", "客服", "service", "service123"),
      makeUser("u_ming", "aming", "阿明", "designer", "design123"),
      makeUser("u_yan", "ayan", "阿言", "designer", "design123"),
      makeUser("u_qi", "aqi", "阿齐", "designer", "design123"),
    ],
    tasks: [
      {
        id: createId("task"),
        title: "奶茶品牌开业海报",
        description: "主视觉、门店立牌和朋友圈长图各一版，风格清爽、有夏日感。",
        wechat: "summer-tea",
        orderNo: "TB20260505001",
        taobaoId: "夏日茶铺",
        creatorId: "u_service",
        assigneeId: "u_ming",
        priority: "high",
        status: "doing",
        progress: 45,
        dueDate: "2026-05-10",
        createdAt: now,
        updatedAt: now,
        attachments: [],
      },
      {
        id: createId("task"),
        title: "服装店五一活动物料",
        description: "电商首页 banner、三张详情页氛围图，需保留品牌黑白基调。",
        wechat: "fashion-vip",
        orderNo: "TB20260505002",
        taobaoId: "黑白衣橱",
        creatorId: "u_service",
        assigneeId: "u_yan",
        priority: "normal",
        status: "review",
        progress: 80,
        dueDate: "2026-05-08",
        createdAt: now,
        updatedAt: now,
        attachments: [],
      },
      {
        id: createId("task"),
        title: "地产项目户外围挡",
        description: "根据客户给的 CAD 和文案做 3 个方向，注意大字远距离识别。",
        wechat: "house-design",
        orderNo: "TB20260505003",
        taobaoId: "城市置业旗舰店",
        creatorId: "u_service",
        assigneeId: "u_qi",
        priority: "urgent",
        status: "todo",
        progress: 10,
        dueDate: "2026-05-12",
        createdAt: now,
        updatedAt: now,
        attachments: [],
      },
    ],
    files: [],
  };
}

function migrateDb() {
  const db = readDb();
  const comments = readComments();
  let changed = false;

  if (!db.users.some((user) => user.role === "service")) {
    db.users.push(makeUser("u_service", "kefu", "客服", "service", "service123"));
    changed = true;
  }

  const fallbackCreator = db.users.find((user) => user.role === "service")?.id || db.users[0]?.id;
  db.tasks.forEach((task) => {
    if (!task.creatorId) {
      task.creatorId = fallbackCreator;
      changed = true;
    }
    for (const field of ["wechat", "orderNo", "taobaoId", "remark"]) {
      if (task[field] === undefined) {
        task[field] = "";
        changed = true;
      }
    }
    if (task.visibility === undefined) {
      task.visibility = "public";
      changed = true;
    }
    if (!Array.isArray(task.remarkRecords)) {
      task.remarkRecords = [];
      changed = true;
    }
    if (!Array.isArray(task.attachments)) {
      task.attachments = [];
      changed = true;
    }
    if (task.archivedAt === undefined) {
      task.archivedAt = "";
      changed = true;
    }
    if (task.archiveZipPath === undefined) {
      task.archiveZipPath = "";
      changed = true;
    }
  });

  if (changed) writeDb(db);
  if (comments.length) writeComments(comments);
}

function makeUser(id, username, name, role, password) {
  return {
    id,
    username,
    name,
    role,
    passwordHash: hashPassword(password),
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(next));
}

function readDb() {
  return {
    users: listUsers(),
    tasks: listTasks(),
    files: listFiles(),
  };
}

function writeDb(data) {
  const users = Array.isArray(data.users) ? data.users : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const files = Array.isArray(data.files) ? data.files : [];

  runInTransaction((db) => {
    clearCoreData(db);
    insertUsers(users, db);
    insertTasks(tasks, db);
    insertFiles(files, db);
  });
}

function readComments() {
  return listComments();
}

function writeComments(comments) {
  runInTransaction((db) => {
    replaceComments(comments, db);
  });
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}

function enrichTask(db, task, comments = readComments()) {
  const assignee = db.users.find((user) => user.id === task.assigneeId);
  const creator = db.users.find((user) => user.id === task.creatorId);
  return {
    ...task,
    assigneeName: assignee ? assignee.name : "未分配",
    creatorName: creator ? creator.name : "未知",
    attachments: task.attachments
      .map((fileId) => {
        const file = db.files.find((item) => item.id === fileId);
        if (!file) return null;
        const uploader = db.users.find((user) => user.id === file.uploadedBy);
        return {
          ...file,
          uploadedByRole: file.uploadedByRole || uploader?.role || "unknown",
        };
      })
      .filter(Boolean),
    comments: comments
      .filter((comment) => comment.taskId === task.id)
      .map((comment) => {
        const author = db.users.find((user) => user.id === comment.authorId);
        return {
          ...comment,
          authorName: author ? author.name : "未知",
          authorRole: author ? author.role : "unknown",
        };
      }),
    remarkRecords: (task.remarkRecords || []).map((record) => {
      const author = db.users.find((user) => user.id === record.authorId);
      return {
        ...record,
        authorName: author ? author.name : "未知",
        authorRole: author ? author.role : "unknown",
        images: (record.imageFileIds || [])
          .map((fileId) => db.files.find((file) => file.id === fileId))
          .filter(Boolean),
      };
    }),
  };
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
  createId,
  enrichTask,
  ensureStorage,
  hashPassword,
  makeUser,
  publicUser,
  readComments,
  readDb,
  verifyPassword,
  writeComments,
  writeDb,
  writeJsonFile,
};
