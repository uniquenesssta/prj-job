const { getDatabase } = require("../database");

function listDepartments(db = getDatabase()) {
  return db.prepare("SELECT * FROM departments ORDER BY disabledAt, name, rowid").all();
}

function createDepartment(department, db = getDatabase()) {
  db.prepare(`
    INSERT INTO departments (
      id, name, description, defaultRole, permissionPreset, disabledAt, deletedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    department.id,
    department.name,
    department.description || "",
    department.defaultRole || "designer",
    department.permissionPreset || "{}",
    department.disabledAt || "",
    department.deletedAt || "",
    department.createdAt,
    department.updatedAt
  );
}

function updateDepartment(department, db = getDatabase()) {
  db.prepare(`
    UPDATE departments
    SET name = ?,
        description = ?,
        defaultRole = ?,
        permissionPreset = ?,
        disabledAt = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(
    department.name,
    department.description || "",
    department.defaultRole || "designer",
    department.permissionPreset || "{}",
    department.disabledAt || "",
    department.updatedAt,
    department.id
  );
}

module.exports = {
  createDepartment,
  listDepartments,
  updateDepartment,
};
