function currentView() {
  if (!state.user) return "service";
  if (state.user.role === "owner") return state.adminView;
  if (userHasPermission("users.manage") && state.adminView === "account") return "account";
  return state.user.role;
}
