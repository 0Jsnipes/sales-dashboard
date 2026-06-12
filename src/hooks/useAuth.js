import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useDemoMode } from "./useDemoMode";

const SUPER_ADMIN_EMAILS = new Set([
  "snipes1995@gmail.com",
  "kunyealogray@gmail.com",
  "j.sexton@abenergymarketing.com",
]);

function isSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.has((email || "").trim().toLowerCase());
}

function isPrimarySuperAdminEmail(email) {
  return (email || "").trim().toLowerCase() === "snipes1995@gmail.com";
}

async function ensureSuperAdminProfile(user) {
  if (!user?.uid || !isSuperAdminEmail(user.email)) return;

  try {
    await setDoc(
      doc(db, "adminUsers", user.uid),
      {
        uid: user.uid,
        email: (user.email || "").trim().toLowerCase(),
        phone: "",
        canEditSales: true,
        canEditKnocks: true,
        canEditRoster: true,
        canEditOnboarding: true,
        canEditReps: true,
        canCreateUsers: true,
        canViewPerformance: true,
        isSuperAdmin: true,
        role: "admin",
        roleLabel: "Admin",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Failed to ensure super-admin profile", error);
  }
}

const EMPTY_PERMS = {
  canEditSales: false,
  canEditKnocks: false,
  canEditRoster: false,
  canEditOnboarding: false,
  canEditReps: false,
  canCreateUsers: false,
  canViewPerformance: false,
};
const ALL_PERMS = {
  canEditSales: true,
  canEditKnocks: true,
  canEditRoster: true,
  canEditOnboarding: true,
  canEditReps: true,
  canCreateUsers: true,
  canViewPerformance: true,
};
const VIEW_PREVIEW_STORAGE_KEY = "ab-sales-view-preview";

function readStoredViewPreview() {
  if (typeof window === "undefined") return { mode: "admin" };
  try {
    const raw = window.localStorage.getItem(VIEW_PREVIEW_STORAGE_KEY);
    if (!raw) return { mode: "admin" };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { mode: "admin" };
    return {
      mode: parsed.mode === "manager" || parsed.mode === "user" ? parsed.mode : "admin",
      team: typeof parsed.team === "string" ? parsed.team : "",
      repId: typeof parsed.repId === "string" ? parsed.repId : "",
      repName: typeof parsed.repName === "string" ? parsed.repName : "",
      location: typeof parsed.location === "string" ? parsed.location : "",
    };
  } catch {
    return { mode: "admin" };
  }
}

function writeStoredViewPreview(nextValue) {
  if (typeof window === "undefined") return;
  try {
    if (!nextValue || nextValue.mode === "admin") {
      window.localStorage.removeItem(VIEW_PREVIEW_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(VIEW_PREVIEW_STORAGE_KEY, JSON.stringify(nextValue));
  } catch {
    // Ignore storage failures and keep preview state in memory.
  }
}

export function useAuthRole() {
  const isDemo = useDemoMode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState(EMPTY_PERMS);
  const [hasAdminProfile, setHasAdminProfile] = useState(false);
  const [profileRole, setProfileRole] = useState("viewer");
  const [profile, setProfile] = useState(null);
  const [viewPreview, setViewPreviewState] = useState(readStoredViewPreview);

  useEffect(() => {
    if (isDemo) {
      setUser(null);
      setPermissions(EMPTY_PERMS);
      setHasAdminProfile(false);
      setProfileRole("demo");
      setProfile(null);
      setLoading(false);
      return undefined;
    }

    let unsubAdmin = null;
    let isActive = true;

    const unsub = onAuthStateChanged(auth, (u) => {
      if (unsubAdmin) {
        unsubAdmin();
        unsubAdmin = null;
      }
      setUser(u);
      setPermissions(EMPTY_PERMS);
      setHasAdminProfile(false);
      setProfileRole("viewer");
      setProfile(null);

      if (!u) {
        setLoading(false);
        return;
      }

      const isSuperAdmin = isSuperAdminEmail(u.email);

      if (isSuperAdmin) {
        setLoading(true);
        setPermissions(ALL_PERMS);
        setHasAdminProfile(true);
        setProfileRole("admin");
        setProfile({
          uid: u.uid,
          email: (u.email || "").trim().toLowerCase(),
          role: "admin",
          roleLabel: "Admin",
          team: "",
          manager: "",
          location: "",
          phone: "",
          repId: "",
          repName: "",
        });
        const bootstrap = ensureSuperAdminProfile(u);
        void bootstrap.finally(() => {
          if (isActive && auth.currentUser?.uid === u.uid) {
            setLoading(false);
          }
        });
        return;
      }

      setLoading(false);
      unsubAdmin = onSnapshot(doc(db, "adminUsers", u.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          setPermissions({
            canEditSales: !!data.canEditSales,
            canEditKnocks: !!data.canEditKnocks,
            canEditRoster: !!data.canEditRoster,
            canEditOnboarding: !!data.canEditOnboarding,
            canEditReps: !!data.canEditReps,
            canCreateUsers: !!data.canCreateUsers,
            canViewPerformance: !!data.canViewPerformance,
          });
          setHasAdminProfile(true);
          setProfileRole(data.role || "user");
          setProfile({
            uid: u.uid,
            email: (u.email || "").trim().toLowerCase(),
            role: data.role || "user",
            roleLabel: data.roleLabel || "",
            team: data.team || "",
            manager: data.manager || "",
            location: data.location || "",
            phone: data.phone || "",
            repId: data.repId || "",
            repName: data.repName || "",
          });
        } else {
          setPermissions(EMPTY_PERMS);
          setHasAdminProfile(false);
          setProfileRole("viewer");
          setProfile(null);
        }
      });
    });

    return () => {
      isActive = false;
      if (unsubAdmin) unsubAdmin();
      unsub();
    };
  }, [isDemo]);

  const setViewPreview = useCallback((nextValue) => {
    const normalized = {
      mode: nextValue?.mode === "manager" || nextValue?.mode === "user" ? nextValue.mode : "admin",
      team: typeof nextValue?.team === "string" ? nextValue.team : "",
      repId: typeof nextValue?.repId === "string" ? nextValue.repId : "",
      repName: typeof nextValue?.repName === "string" ? nextValue.repName : "",
      location: typeof nextValue?.location === "string" ? nextValue.location : "",
    };
    setViewPreviewState(normalized);
    writeStoredViewPreview(normalized);
  }, []);

  const clearViewPreview = useCallback(() => {
    const cleared = { mode: "admin" };
    setViewPreviewState(cleared);
    writeStoredViewPreview(cleared);
  }, []);

  const actualIsSuperAdmin = isSuperAdminEmail(user?.email);
  const actualIsPrimarySuperAdmin = isPrimarySuperAdminEmail(user?.email);
  const actualIsAdmin = !!user && (actualIsSuperAdmin || hasAdminProfile);
  const actualIsAdminRole = actualIsSuperAdmin || profileRole === "admin";
  const actualIsManager = !actualIsSuperAdmin && profileRole === "manager";
  const actualIsUser = !actualIsSuperAdmin && profileRole === "user";

  const isPreviewing =
    !!user &&
    actualIsPrimarySuperAdmin &&
    (viewPreview.mode === "manager" || viewPreview.mode === "user");

  const effectiveProfile = useMemo(() => {
    if (!isPreviewing) return profile;

    if (viewPreview.mode === "manager") {
      return {
        ...(profile || {}),
        uid: user?.uid || "",
        email: (user?.email || "").trim().toLowerCase(),
        role: "manager",
        roleLabel: "Manager",
        team: viewPreview.team || "",
        manager: viewPreview.team || "",
        location: "",
        phone: profile?.phone || "",
        repId: "",
        repName: "",
      };
    }

    return {
      ...(profile || {}),
      uid: user?.uid || "",
      email: (user?.email || "").trim().toLowerCase(),
      role: "user",
      roleLabel: "User",
      team: viewPreview.team || "",
      manager: viewPreview.team || "",
      location: viewPreview.location || "",
      phone: profile?.phone || "",
      repId: viewPreview.repId || "",
      repName: viewPreview.repName || "",
    };
  }, [isPreviewing, profile, user?.email, user?.uid, viewPreview]);

  const effectivePermissions = useMemo(() => {
    if (!isPreviewing) return permissions;
    return EMPTY_PERMS;
  }, [isPreviewing, permissions]);

  const isSuperAdmin = actualIsSuperAdmin && !isPreviewing;
  const isPrimarySuperAdmin = actualIsPrimarySuperAdmin;
  const isAdminRole = isPreviewing ? false : actualIsAdminRole;
  const isManager = isPreviewing ? viewPreview.mode === "manager" : actualIsManager;
  const isUser = isPreviewing ? viewPreview.mode === "user" : actualIsUser;
  const isAdmin = isPreviewing ? false : actualIsAdmin;
  const effectiveRole = isPreviewing ? viewPreview.mode : actualIsAdmin ? profileRole : isDemo ? "demo" : "viewer";

  return {
    user,
    role: effectiveRole,
    isAdmin,
    isSuperAdmin,
    isPrimarySuperAdmin,
    isAdminRole,
    isManager,
    isUser,
    permissions: effectivePermissions,
    profile: effectiveProfile,
    loading,
    isDemo,
    actualIsAdmin,
    actualIsSuperAdmin,
    actualIsPrimarySuperAdmin,
    actualIsAdminRole,
    actualIsManager,
    actualIsUser,
    isPreviewing,
    viewPreview,
    setViewPreview,
    clearViewPreview,
  };
}

// alias for backward compatibility
export function useAuth() {
  return useAuthRole();
}

export default useAuthRole;
