const { getDatabase } = require("../database");

function listDepartments(db = getDatabase()) {
  return db.prepare("SELECT * FROM departments ORDER BY disabledAt, parentId, name, rowid").all();
}

function createDepartment(department, db = getDatabase()) {
  db.prepare(`
    INSERT INTO departments (
      id, name, description, defaultRole, customRoleName, permissionPreset,
      parentId, parentDepartmentIds, managerId, allowViewOwnDepartmentTasks, allowViewChildDepartmentTasks, childDepartmentScope,
      disabledAt, deletedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    department.id,
    department.name,
    department.description || "",
    department.defaultRole || "designer",
    department.customRoleName || "",
    department.permissionPreset || "{}",
    department.parentId || "",
    department.parentDepartmentIds || "[]",
    department.managerId || "",
    department.allowViewOwnDepartmentTasks ? 1 : 0,
    department.allowViewChildDepartmentTasks ? 1 : 0,
    department.childDepartmentScope || "[]",
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
        customRoleName = ?,
        permissionPreset = ?,
        parentId = ?,
        parentDepartmentIds = ?,
        managerId = ?,
        allowViewOwnDepartmentTasks = ?,
        allowViewChildDepartmentTasks = ?,
        childDepartmentScope = ?,
        disabledAt = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(
    department.name,
    department.description || "",
    department.defaultRole || "designer",
    department.customRoleName || "",
    department.permissionPreset || "{}",
    department.parentId || "",
    department.parentDepartmentIds || "[]",
    department.managerId || "",
    department.allowViewOwnDepartmentTasks ? 1 : 0,
    department.allowViewChildDepartmentTasks ? 1 : 0,
    department.childDepartmentScope || "[]",
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
