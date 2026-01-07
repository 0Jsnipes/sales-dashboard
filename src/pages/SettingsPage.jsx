import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuthRole } from "../hooks/useAuth";

const EMPTY_FORM = {
  uid: "",
  email: "",
  canEditSales: true,
  canEditKnocks: true,
  canEditRoster: true,
  canEditOnboarding: true,
};

export default function SettingsPage() {
  const { user, isSuperAdmin, loading } = useAuthRole();
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsub = onSnapshot(collection(db, "adminUsers"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ea = (a.email || "").toLowerCase();
        const eb = (b.email || "").toLowerCase();
        return ea.localeCompare(eb);
      });
      setAdmins(rows);
    });
    return () => unsub();
  }, [isSuperAdmin]);

  const addAdmin = async (e) => {
    e.preventDefault();
    setError("");
    const uid = form.uid.trim();
    const email = form.email.trim().toLowerCase();
    if (!uid || !email) {
      setError("UID and email are required.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "adminUsers", uid), {
        uid,
        email,
        canEditSales: !!form.canEditSales,
        canEditKnocks: !!form.canEditKnocks,
        canEditRoster: !!form.canEditRoster,
        canEditOnboarding: !!form.canEditOnboarding,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err?.message || "Failed to add admin user.");
    } finally {
      setSaving(false);
    }
  };

  const updatePerm = async (uid, key, nextVal) => {
    try {
      await updateDoc(doc(db, "adminUsers", uid), {
        [key]: nextVal,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
    } catch (err) {
      alert(err?.message || "Failed to update permissions.");
    }
  };

  const removeAdmin = async (uid) => {
    if (!window.confirm("Remove this admin?")) return;
    try {
      await deleteDoc(doc(db, "adminUsers", uid));
    } catch (err) {
      alert(err?.message || "Failed to remove admin.");
    }
  };

  const currentUid = user?.uid || "";

  if (loading) {
    return <div className="p-6 text-slate-600">Loading...</div>;
  }

  if (!isSuperAdmin) {
    return <div className="p-6 text-slate-600">Access restricted.</div>;
  }

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Admin Settings
          </h1>
          <p className="text-sm text-slate-600">
            Manage admin permissions. Each admin needs a Firebase Auth account and UID.
          </p>
          <div className="mt-3 text-xs text-slate-500">
            Your UID: <span className="font-mono">{currentUid || "Unknown"}</span>
          </div>
        </header>

        <form onSubmit={addAdmin} className="rounded-2xl border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <input
              className="input input-bordered input-sm w-full"
              placeholder="User UID"
              value={form.uid}
              onChange={(e) => setForm((prev) => ({ ...prev, uid: e.target.value }))}
            />
            <input
              className="input input-bordered input-sm w-full"
              placeholder="User email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {[
              ["canEditSales", "Edit Sales"],
              ["canEditKnocks", "Edit Knocks"],
              ["canEditRoster", "Edit Roster"],
              ["canEditOnboarding", "Edit Onboarding"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={!!form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
              </label>
            ))}
          </div>

          {error && <div className="mt-2 text-sm text-error">{error}</div>}

          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Admin"}
            </button>
          </div>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="table w-full">
            <thead className="bg-slate-100/90 text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
              <tr>
                <th>Email</th>
                <th className="min-w-[180px]">UID</th>
                <th className="text-center">Sales</th>
                <th className="text-center">Knocks</th>
                <th className="text-center">Roster</th>
                <th className="text-center">Onboarding</th>
                <th />
              </tr>
            </thead>
            <tbody className="[&>tr>td]:border-b [&>tr>td]:border-slate-200">
              {admins.map((admin) => {
                const isSelf = admin.id === currentUid;
                return (
                  <tr key={admin.id}>
                    <td className="font-medium">{admin.email || "Unknown"}</td>
                    <td className="text-xs font-mono text-slate-500">{admin.id}</td>
                    {[
                      "canEditSales",
                      "canEditKnocks",
                      "canEditRoster",
                      "canEditOnboarding",
                    ].map((key) => (
                      <td key={key} className="text-center">
                        <input
                          type="checkbox"
                          className="toggle toggle-sm"
                          checked={!!admin[key]}
                          disabled={isSelf}
                          onChange={(e) => updatePerm(admin.id, key, e.target.checked)}
                        />
                      </td>
                    ))}
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => removeAdmin(admin.id)}
                        disabled={isSelf}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-slate-500">
                    No admin users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
