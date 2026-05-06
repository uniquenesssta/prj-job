function renderHeader(view) {
  const titleMap = {
    designer: state.user.role === "owner" ? "设计师执行视图" : "我的设计任务",
    service: state.user.role === "owner" ? "客服录单视图" : "客服任务录入",
    account: "账号管理",
    archived: "归档项目",
  };
  const subtitleMap = {
    designer: "优先级、截止时间、备注和附件集中在一张清爽任务池里。",
    service: "把客户微信、订单号、淘宝ID和设计要求一次录清楚。",
    account: "新增管理员、客服或设计师账号，并查看当前团队。",
    archived: "已归档项目默认对客服和设计师隐藏，管理员可在这里查看并恢复显示。",
  };
  document.querySelector("#roleEyebrow").textContent = state.user.role === "owner" ? "Admin Console" : roleLabels[state.user.role];
  document.querySelector("#pageTitle").textContent = titleMap[view];
  document.querySelector("#pageSubtitle").textContent = subtitleMap[view];
}

function renderToolbar(view) {
  viewTabs.hidden = view === "account";
  assigneeFilterWrap.hidden = view !== "designer" || state.user.role !== "owner";
  searchInput.closest("label").hidden = view === "account";
  layoutSwitch.hidden = !["designer", "archived"].includes(view);
}

function renderMetrics(view) {
  const tasks = filteredTasks(view);
  const metricItems =
    view === "account"
      ? [
          ["总账号", state.users.length],
          ["设计师", state.users.filter((user) => user.role === "designer").length],
          ["客服", state.users.filter((user) => user.role === "service").length],
          ["管理员", state.users.filter((user) => user.role === "owner").length],
        ]
      : [
          ["任务数", tasks.length],
          ["进行中", tasks.filter((task) => task.status === "doing").length],
          ["待审核", tasks.filter((task) => task.status === "review").length],
          ["临近截止", tasks.filter(isDueSoon).length],
        ];
  metrics.innerHTML = metricItems.map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
}
