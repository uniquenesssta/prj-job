const state = {
  user: null,
  users: [],
  departments: [],
  tasks: [],
  selectedTaskId: null,
  status: "all",
  assignee: "all",
  quickFilter: "all",
  search: "",
  adminView: "overview",
  designerView: "public",
  layout: "card",
  events: null,
  briefEditOpen: false,
  personalTaskModalOpen: false,
  adminTaskCreateModalOpen: false,
  taskDetailModalOpen: false,
  personalNotesByTask: {},
  pendingRemarkImages: [],
  remarkImageViewer: null,
  remarkImageZoom: 1,
  accountModal: "",
  accountEditingUserId: "",
  departmentEditingId: "",
  accountSearch: "",
  accountRoleFilter: "all",
  accountStatusFilter: "all",
  accountSelectedUserIds: [],
  accountBulkRole: "",
  accountBulkDepartmentId: "",
  accountDisableTransferUserId: "",
  accountDisableTransferAction: "keep",
  accountDisableTransferToUserId: "",
  overviewExpandedPanel: "",
  selectedDesignerId: "",
  selectedServiceId: "",
  overviewTaskFilter: "all",
  overviewSearch: "",
  maintenanceSummary: null,
  maintenanceLogs: [],
  maintenanceKeyword: "",
  peerViewModal: "",
  peerViewSelectedId: "",
  peerViewSearch: "",
  peerViewStatus: "all",
  archiveMissingScan: null,
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
  custom: "自定义",
};

const quickFilterLabels = {
  all: "全部",
  urgent: "加急",
  today: "今日截止",
  overdue: "已超时",
  messages: "有留言/备注",
  files: "有附件",
  createdByMe: "我创建",
  assignedToMe: "我负责",
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
const quickFilters = document.querySelector("#quickFilters");
const searchInput = document.querySelector("#searchInput");
const layoutSwitch = document.querySelector("#designerLayoutSwitch");
