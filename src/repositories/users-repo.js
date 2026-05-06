const { getDatabase } = require("../database");

function listUsers(db = getDatabase()) {
  return db.prepare("SELECT * FROM users ORDER BY rowid").all();
}

function insertUsers(users, db = getDatabase()) {
  const insert = db.prepare("INSERT INTO users (id, username, name, role, passwordHash) VALUES (?, ?, ?, ?, ?)");
  (users || []).forEach((user) => insert.run(user.id, user.username, user.name, user.role, user.passwordHash));
}

module.exports = {
  insertUsers,
  listUsers,
};
