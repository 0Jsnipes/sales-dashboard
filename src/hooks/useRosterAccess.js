import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { isEmailAllowed, normalizeEmail, rosterViewAllowlist } from "../lib/access";

function rosterEntryMatchesEmail(entry, email) {
  return normalizeEmail(entry?.emailNormalized || entry?.email) === email;
}

export function useRosterAccess(email, isAdmin) {
  const normalizedEmail = normalizeEmail(email);
  const isAllowlisted = isEmailAllowed(rosterViewAllowlist, normalizedEmail);
  const [hasRosterEntry, setHasRosterEntry] = useState(false);
  const [loading, setLoading] = useState(
    !!normalizedEmail && !isAdmin && !isAllowlisted
  );

  useEffect(() => {
    if (!normalizedEmail || isAdmin || isAllowlisted) {
      setHasRosterEntry(false);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const unsub = onSnapshot(
      collection(db, "roster"),
      (snap) => {
        setHasRosterEntry(
          snap.docs.some((docSnap) => rosterEntryMatchesEmail(docSnap.data(), normalizedEmail))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Failed to verify roster access", error);
        setHasRosterEntry(false);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [isAdmin, isAllowlisted, normalizedEmail]);

  return {
    canViewRoster: !!isAdmin || isAllowlisted || hasRosterEntry,
    hasRosterEntry,
    loading,
  };
}

export default useRosterAccess;
