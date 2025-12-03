import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

export function useAuthRole() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // anyone signed in is "admin"
  return { user, role: user ? "admin" : "viewer", isAdmin: !!user, loading };
}

// alias for backward compatibility
export function useAuth() {
  return useAuthRole();
}

export default useAuthRole;
