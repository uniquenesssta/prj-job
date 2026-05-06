const state = {
  user: null,
  users: [],
  tasks: [],
  selectedTaskId: null,
  status: "all",
  assignee: "all",
  search: "",
  adminView: "designer",
  designerView: "public",
  layout: "card",
  events: null,
  briefEditOpen: false,
  personalTaskModalOpen: false,
};

const statusLabels = {
  todo: "待开始",
  doing: "进行中",
  review: "待审核",
  done: "已完成",
  blocked: "卡住了",
};

const priorityLabels = {
  low: "低",
  normal: "普通",
  high: "重要",
  urgent: "加急",
};

const roleLabels = {
  owner: "管理员",
  designer: "设计师",
  service: "客服",
};

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const workspace = document.querySelector("#workspace");
const metrics = document.querySelector("#metrics");
const adminTabs = document.querySelector("#adminTabs");
const viewTabs = document.querySelector("#viewTabs");
const assigneeFilter = document.querySelector("#assigneeFilter");
const assigneeFilterWrap = document.querySelector("#assigneeFilterWrap");
const searchInput = document.querySelector("#searchInput");
const layoutSwitch = document.querySelector("#designerLayoutSwitch");
