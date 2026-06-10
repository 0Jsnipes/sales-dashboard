import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { PageHero, PageShell } from "../components/PageLayout.jsx";
import { useAuthRole } from "../hooks/useAuth";
import { db } from "../lib/firebase";

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
    if (!isSuperAdmin) return undefined;
    const unsubscribe = onSnapshot(collection(db, "adminUsers"), (snapshot) => {
      const rows = snapshot.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
      rows.sort((a, b) => (a.email || "").toLowerCase().localeCompare((b.email || "").toLowerCase()));
      setAdmins(rows);
    });
    return () => unsubscribe();
  }, [isSuperAdmin]);

  const addAdmin = async (event) => {
    event.preventDefault();
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
    return (
      <PageShell>
        <div className="surface-panel px-5 py-8 text-sm text-slate-600">Loading...</div>
      </PageShell>
    );
  }

  if (!isSuperAdmin) {
    return (
      <PageShell>
        <div className="surface-panel px-5 py-8 text-sm text-slate-600">Access restricted.</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Admin Controls"
        title="Manage who can change what."
        description="Super admins can grant or revoke editing access across sales, knocks, roster, and onboarding workflows from one place."
        stats={[
          { label: "Admins", value: admins.length || 0 },
          { label: "Your UID", value: currentUid || "Unknown" },
          { label: "Sales Access", value: "Configurable" },
          { label: "Scope", value: "Internal Only" },
        ]}
      />

      <section className="glass-panel p-5">
        <form onSubmit={addAdmin} className="rounded-[24px] border border-slate-200/70 bg-white/74 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input input-bordered h-12 w-full"
              placeholder="User UID"
              value={form.uid}
              onChange={(event) => setForm((prev) => ({ ...prev, uid: event.target.value }))}
            />
            <input
              className="input input-bordered h-12 w-full"
              placeholder="User email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["canEditSales", "Edit Sales"],
              ["canEditKnocks", "Edit Knocks"],
              ["canEditRoster", "Edit Roster"],
              ["canEditOnboarding", "Edit Onboarding"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={!!form[key]}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, [key]: event.target.checked }))
                  }
                />
              </label>
            ))}
          </div>

          {error ? (
            <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Admin"}
            </button>
          </div>
        </form>

        <div className="data-table-shell mt-5">
          <div className="data-table-scroll">
            <table className="table w-full min-w-[860px]">
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
                            onChange={(event) => updatePerm(admin.id, key, event.target.checked)}
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
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm text-slate-500">
                      No admin users yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
