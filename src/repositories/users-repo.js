const { getDatabase } = require("../database");

function listUsers(db = getDatabase()) {
  return db.prepare("SELECT * FROM users ORDER BY rowid").all();
}

function insertUsers(users, db = getDatabase()) {
  const insert = db.prepare(`
    INSERT INTO users (
      id, username, name, role, departmentId, customPermissions, disabledAt, deletedAt, passwordHash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (users || []).forEach((user) => {
    insert.run(
      user.id,
      user.username,
      user.name,
      user.role,
      user.departmentId || defaultDepartmentId(user.role),
      user.customPermissions || "{}",
      user.disabledAt || "",
      user.deletedAt || "",
      user.passwordHash
    );
  });
}

function defaultDepartmentId(role) {
  return {
    owner: "dept_admin",
    service: "dept_service",
    designer: "dept_design",
  }[role] || "dept_design";
}

module.exports = {
  insertUsers,
  listUsers,
  defaultDepartmentId,
};
