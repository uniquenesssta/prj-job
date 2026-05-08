function mountDepartmentOrganization(view) {
  if (view !== "account" || state.accountModal !== "departments") return;
  enhanceDepartmentOrganizationForm();
  enhanceDepartmentPreviewTree();
}

function enhanceDepartmentOrganizationForm() {
  const formGrid = document.querySelector(".department-form-grid");
  if (!formGrid || document.querySelector("#departmentOrgFields")) return;
  const editing = state.departmentEditingId ? state.departments.find((item) => item.id === state.departmentEditingId) : null;
  const managerOptions = state.users
    .filter((user) => !user.disabledAt && !user.deletedAt)
    .map((user) => `<option value="${user.id}" ${editing?.managerId === user.id ? "selected" : ""}>${escapeHtml(user.name)} · ${roleLabels[user.role] || user.role}</option>`)
    .join("");
  const parentOptions = departmentTreeOptions(editing?.parentId || "", editing?.id || "");
  const childScopeOptions = renderChildDepartmentScopeOptions(editing);
  formGrid.insertAdjacentHTML(
    "beforeend",
    `
      <div class="department-org-fields wide-field" id="departmentOrgFields">
        <label>
          <span>上级部门</span>
          <select name="parentId">
            <option value="">无上级部门</option>
            ${parentOptions}
          </select>
        </label>
        <label>
          <span>部门主管</span>
          <select name="managerId">
            <option value="">暂不指定</option>
            ${managerOptions}
          </select>
        </label>
        <label class="department-org-check">
          <input type="checkbox" name="allowViewOwnDepartmentTasks" value="true" ${normalizeDepartmentFlag(editing?.allowViewOwnDepartmentTasks) ? "checked" : ""} />
          <span>允许查看本部门任务</span>
        </label>
        <label class="department-org-check">
          <input type="checkbox" name="allowViewChildDepartmentTasks" value="true" ${normalizeDepartmentFlag(editing?.allowViewChildDepartmentTasks) ? "checked" : ""} />
          <span>允许查看下级部门任务</span>
        </label>
        <section class="department-child-scope">
          <strong>可查看的下级部门</strong>
          <p>不勾选时默认查看全部下级部门；勾选后只查看选中的下级部门及其子部门。</p>
          <div>${childScopeOptions || '<span class="muted-text">当前没有下级部门可选</span>'}</div>
        </section>
      </div>
    `
  );
}

function renderChildDepartmentScopeOptions(editing) {
  if (!editing?.id) return "";
  const selected = new Set(parseJsonArray(editing.childDepartmentScope));
  return flattenDepartmentTree(buildDepartmentTree())
    .filter((item) => item.department.id !== editing.id && isDepartmentDescendant(editing.id, item.department.id))
    .map((item) => {
      const prefix = "　".repeat(Math.max(0, item.depth - 1)) + (item.depth ? "└ " : "");
      return `
        <label class="department-org-check child-scope-check">
          <input type="checkbox" name="childDepartmentScope" value="${item.department.id}" ${selected.has(item.department.id) ? "checked" : ""} />
          <span>${prefix}${escapeHtml(item.department.name)}</span>
        </label>
      `;
    })
    .join("");
}

function isDepartmentDescendant(parentId, departmentId) {
  let cursor = state.departments.find((dept) => dept.id === departmentId)?.parentId || "";
  const visited = new Set();
  while (cursor) {
    if (cursor === parentId) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    cursor = state.departments.find((dept) => dept.id === cursor)?.parentId || "";
  }
  return false;
}

function enhanceDepartmentPreviewTree() {
  const preview = document.querySelector(".department-preview");
  if (!preview || preview.dataset.organizationEnhanced === "1") return;
  preview.dataset.organizationEnhanced = "1";
  preview.querySelectorAll(":scope > article").forEach((node) => node.remove());
  const tree = buildDepartmentTree();
  preview.insertAdjacentHTML("beforeend", renderDepartmentTree(tree));
}

function departmentTreeOptions(selectedId, currentId) {
  return flattenDepartmentTree(buildDepartmentTree()).filter((item) => item.department.id !== currentId).map((item) => {
    const prefix = "　".repeat(item.depth) + (item.depth ? "└ " : "");
    return `<option value="${item.department.id}" ${selectedId === item.department.id ? "selected" : ""}>${prefix}${escapeHtml(item.department.name)}</option>`;
  }).join("");
}

function buildDepartmentTree() {
  const departments = [...state.departments].sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
  const byParent = departments.reduce((map, department) => {
    const parentId = department.parentId || "";
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(department);
    return map;
  }, new Map());
  const visited = new Set();
  const build = (parentId = "", depth = 0) => (byParent.get(parentId) || []).filter((department) => !visited.has(department.id)).map((department) => {
    visited.add(department.id);
    return { department, depth, children: build(department.id, depth + 1) };
  });
  const roots = build("");
  departments.filter((department) => !visited.has(department.id)).forEach((department) => roots.push({ department, depth: 0, children: [] }));
  return roots;
}

function flattenDepartmentTree(nodes) {
  return nodes.flatMap((node) => [{ department: node.department, depth: node.depth }, ...flattenDepartmentTree(node.children)]);
}

function renderDepartmentTree(nodes) {
  if (!nodes.length) return '<div class="empty">暂无部门</div>';
  return `<div class="department-org-tree">${nodes.map(renderDepartmentTreeNode).join("")}</div>`;
}

function renderDepartmentTreeNode(node) {
  const dept = node.department;
  const manager = state.users.find((user) => user.id === dept.managerId);
  const scopedCount = parseJsonArray(dept.childDepartmentScope).length;
  return `
    <article class="department-org-node ${dept.disabledAt ? "disabled" : ""}" style="--dept-depth:${node.depth}">
      <div>
        <strong>${escapeHtml(dept.name)}</strong>
        <span>${escapeHtml(dept.description || "暂无说明")}</span>
        <small>默认角色：${departmentRoleLabel(dept)} · 主管：${manager ? escapeHtml(manager.name) : "未指定"}</small>
        <small>${normalizeDepartmentFlag(dept.allowViewOwnDepartmentTasks) ? "可看本部门" : "不可看本部门"} · ${normalizeDepartmentFlag(dept.allowViewChildDepartmentTasks) ? `可看下级${scopedCount ? `（已选 ${scopedCount} 个范围）` : "（全部）"}` : "不可看下级"}</small>
      </div>
      <div class="account-actions">
        <button type="button" data-department-action="edit" data-department-id="${dept.id}">编辑</button>
        <button type="button" data-department-action="toggle" data-department-id="${dept.id}">${dept.disabledAt ? "启用" : "禁用"}</button>
      </div>
    </article>
    ${node.children.map(renderDepartmentTreeNode).join("")}
  `;
}

function normalizeDepartmentFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function handleDepartmentSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const departmentId = form.get("id");
  const body = {
    name: form.get("name"),
    description: form.get("description"),
    defaultRole: form.get("defaultRole"),
    customRoleName: form.get("customRoleName"),
    disabled: form.get("disabled"),
    parentId: form.get("parentId"),
    managerId: form.get("managerId"),
    allowViewOwnDepartmentTasks: form.has("allowViewOwnDepartmentTasks") ? "true" : "false",
    allowViewChildDepartmentTasks: form.has("allowViewChildDepartmentTasks") ? "true" : "false",
    childDepartmentScope: JSON.stringify(form.getAll("childDepartmentScope")),
    permissionPreset: JSON.stringify(normalizePermissionFormData(form)),
  };
  const message = document.querySelector("#departmentMessage");
  if (message) message.textContent = "";
  try {
    if (departmentId) {
      await api(`/api/departments/${departmentId}`, { method: "PATCH", body });
    } else {
      await api("/api/departments", { method: "POST", body });
    }
    await refreshDepartments();
    state.departmentEditingId = "";
    render();
  } catch (error) {
    if (message) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  }
}
