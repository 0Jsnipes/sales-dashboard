import { useEffect, useState } from "react";
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

async function ensureSuperAdminProfile(user) {
  if (!user?.uid || !isSuperAdminEmail(user.email)) return;

  try {
    await setDoc(
      doc(db, "adminUsers", user.uid),
      {
        uid: user.uid,
        email: (user.email || "").trim().toLowerCase(),
        canEditSales: true,
        canEditKnocks: true,
        canEditRoster: true,
        canEditOnboarding: true,
        isSuperAdmin: true,
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
    let isActive = true;

    const unsub = onAuthStateChanged(auth, (u) => {
      if (unsubAdmin) {
        unsubAdmin();
        unsubAdmin = null;
      }
      setUser(u);
      setPermissions(EMPTY_PERMS);
      setHasAdminProfile(false);

      if (!u) {
        setLoading(false);
        return;
      }

      const isSuperAdmin = isSuperAdminEmail(u.email);

      if (isSuperAdmin) {
        setLoading(true);
        setPermissions(ALL_PERMS);
        setHasAdminProfile(true);
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
          });
          setHasAdminProfile(true);
        } else {
          setPermissions(EMPTY_PERMS);
          setHasAdminProfile(false);
        }
      });
    });

    return () => {
      isActive = false;
      if (unsubAdmin) unsubAdmin();
      unsub();
    };
  }, [isDemo]);

  const isSuperAdmin = isSuperAdminEmail(user?.email);
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
