export function buildAccessScope(authState) {
  const { isDemo, isSuperAdmin, isAdminRole, isManager, isUser, profile, permissions } =
    authState || {};

  if (isDemo || isSuperAdmin) {
    return {
      canViewSales: true,
      canViewKnocks: true,
      canViewPerformance: true,
      canViewOnboarding: !!isSuperAdmin || !!permissions?.canEditOnboarding,
      canViewMap: true,
      repNameFilter: "",
      managerFilter: "",
      locationFilter: "",
      hideFilters: false,
      lockManagerFilter: false,
      lockLocationFilter: false,
    };
  }

  if (isUser) {
    return {
      canViewSales: true,
      canViewKnocks: true,
      canViewPerformance: true,
      canViewOnboarding: false,
      canViewMap: false,
      repNameFilter: (profile?.repName || "").trim(),
      managerFilter: "",
      locationFilter: "",
      hideFilters: true,
      lockManagerFilter: true,
      lockLocationFilter: true,
    };
  }

  if (isManager) {
    return {
      canViewSales: true,
      canViewKnocks: true,
      canViewPerformance: true,
      canViewOnboarding: true,
      canViewMap: false,
      repNameFilter: "",
      managerFilter: (profile?.team || "").trim(),
      locationFilter: "",
      hideFilters: false,
      lockManagerFilter: true,
      lockLocationFilter: false,
    };
  }

  if (isAdminRole) {
    return {
      canViewSales: true,
      canViewKnocks: true,
      canViewPerformance: !!permissions?.canViewPerformance,
      canViewOnboarding: !!permissions?.canEditOnboarding,
      canViewMap: true,
      repNameFilter: "",
      managerFilter: "",
      locationFilter: "",
      hideFilters: false,
      lockManagerFilter: false,
      lockLocationFilter: false,
    };
  }

  return {
    canViewSales: false,
    canViewKnocks: false,
    canViewPerformance: false,
    canViewOnboarding: false,
    canViewMap: false,
    repNameFilter: "",
    managerFilter: "",
    locationFilter: "",
    hideFilters: true,
    lockManagerFilter: true,
    lockLocationFilter: true,
  };
}
