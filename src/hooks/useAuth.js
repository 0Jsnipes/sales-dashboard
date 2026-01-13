import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useDemoMode } from "./useDemoMode";

const SUPER_ADMIN_EMAIL = "snipes1995@gmail.com";
const EMPTY_PERMS = {
  canEditSales: false,
  canEditKnocks: false,
  canEditRoster: false,
  canEditOnboarding: false,
};
const ALL_PERMS = {
  canEditSales: true,
  canEditKnocks: true,
  canEditRoster: true,
  canEditOnboarding: true,
};

export function useAuthRole() {
  const isDemo = useDemoMode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState(EMPTY_PERMS);
  const [hasAdminProfile, setHasAdminProfile] = useState(false);

  useEffect(() => {
    if (isDemo) {
      setUser(null);
      setPermissions(EMPTY_PERMS);
      setHasAdminProfile(false);
      setLoading(false);
      return undefined;
    }

    let unsubAdmin = null;

    const unsub = onAuthStateChanged(auth, (u) => {
      if (unsubAdmin) {
        unsubAdmin();
        unsubAdmin = null;
      }
      setUser(u);
      setLoading(false);
      setPermissions(EMPTY_PERMS);
      setHasAdminProfile(false);

      if (!u) return;

      const email = (u.email || "").toLowerCase();
      const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

      if (isSuperAdmin) {
        setPermissions(ALL_PERMS);
        setHasAdminProfile(true);
        return;
      }
    });

    return () => {
      if (unsubAdmin) unsubAdmin();
      unsub();
    };
  }, [isDemo]);

  const isSuperAdmin =
    !!user?.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
  const isAdmin = !!user && (isSuperAdmin || hasAdminProfile);

  return {
    user,
    role: isAdmin ? "admin" : isDemo ? "demo" : "viewer",
    isAdmin,
    isSuperAdmin,
    permissions,
    loading,
    isDemo,
  };
}

// alias for backward compatibility
export function useAuth() {
  return useAuthRole();
}

export default useAuthRole;
