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
import AddRepsModal from "../components/AddRepsModal.jsx";
import EditRepsModal from "../components/EditRepsModal.jsx";
import Modal from "../components/Modal.jsx";
import { LoadingPanel, PageHero, PageShell, SectionIntro } from "../components/PageLayout.jsx";
import { useAuthRole } from "../hooks/useAuth";
import { normalizeEmail } from "../lib/access";
import { db } from "../lib/firebase";
import { startOfWeek, toISO } from "../utils/weeks.js";

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
    description: "Permission-based internal access",
    permissions: {
      canEditSales: false,
      canEditKnocks: false,
      canEditRoster: true,
      canEditOnboarding: false,
      canEditReps: false,
      canCreateUsers: false,
      canViewPerformance: false,
    },
  },
  {
    value: "manager",
    label: "Manager",
    description: "Team-scoped view access plus onboarding",
    permissions: {
      canEditSales: false,
      canEditKnocks: false,
      canEditRoster: false,
      canEditOnboarding: true,
      canEditReps: false,
      canCreateUsers: false,
      canViewPerformance: true,
    },
  },
  {
    value: "user",
    label: "User",
    description: "Self-scoped read access",
    permissions: {
      canEditSales: false,
      canEditKnocks: false,
      canEditRoster: false,
      canEditOnboarding: false,
      canEditReps: false,
      canCreateUsers: false,
      canViewPerformance: true,
    },
  },
];

const PERMISSION_FIELDS = [
  ["canEditSales", "Edit Sales"],
  ["canEditKnocks", "Edit Knocks"],
  ["canEditRoster", "Edit Roster"],
  ["canEditOnboarding", "Onboarding Access"],
  ["canEditReps", "Edit Reps"],
  ["canCreateUsers", "Create Users"],
  ["canViewPerformance", "View Performance"],
];

const DEFAULT_ROLE = ROLE_OPTIONS.find((role) => role.value === "user");

function buildEmptyForm() {
  return {
    email: "",
    password: "",
    role: "user",
    repId: "",
    repName: "",
    location: "",
    team: "",
    ...DEFAULT_ROLE.permissions,
  };
}

function buildEditUserForm(account) {
  return {
    id: account?.id || "",
    email: account?.email || "",
    role: account?.role || "user",
    repId: account?.repId || "",
    repName: account?.repName || "",
    location: account?.location || "",
    team: account?.team || account?.manager || "",
    canEditSales: !!account?.canEditSales,
    canEditKnocks: !!account?.canEditKnocks,
    canEditRoster: !!account?.canEditRoster,
    canEditOnboarding: !!account?.canEditOnboarding,
    canEditReps: !!account?.canEditReps,
    canCreateUsers: !!account?.canCreateUsers,
    canViewPerformance: !!account?.canViewPerformance,
  };
}

function sortByLabel(values) {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export default function SettingsPage() {
  const {
    user,
    profile,
    actualIsPrimarySuperAdmin,
    isManager,
    loading,
  } = useAuthRole();
  const currentWeekISO = toISO(startOfWeek());
  const [users, setUsers] = useState([]);
  const [reps, setReps] = useState([]);
  const [form, setForm] = useState(buildEmptyForm);
  const [savingUser, setSavingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");
  const [editUserForm, setEditUserForm] = useState(null);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(true);
  const [repPanelOpen, setRepPanelOpen] = useState(true);
  const [addRepOpen, setAddRepOpen] = useState(false);
  const [editRepOpen, setEditRepOpen] = useState(false);
  const [repToEdit, setRepToEdit] = useState(null);
  const [options, setOptions] = useState({ manager: [], location: [] });
  const [userSearch, setUserSearch] = useState("");
  const [userTeamFilter, setUserTeamFilter] = useState("");
  const [userLocationFilter, setUserLocationFilter] = useState("");
  const [profileForm, setProfileForm] = useState({ repName: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);

  useEffect(() => {
    if (!actualIsPrimarySuperAdmin) return undefined;
    const unsubscribe = onSnapshot(collection(db, "adminUsers"), (snapshot) => {
      const rows = snapshot.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
      rows.sort((a, b) =>
        (a.email || "").toLowerCase().localeCompare((b.email || "").toLowerCase())
      );
      setUsers(rows);
    });
    return () => unsubscribe();
  }, [actualIsPrimarySuperAdmin]);

  useEffect(() => {
    if (!actualIsPrimarySuperAdmin) return undefined;
    const unsubscribe = onSnapshot(collection(db, "weeks", currentWeekISO, "reps"), (snapshot) => {
      const rows = snapshot.docs
        .map((docRef) => ({ id: docRef.id, ...docRef.data() }))
        .filter((rep) => !rep.deleted);
      rows.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, {
          sensitivity: "base",
        })
      );
      setReps(rows);
    });
    return () => unsubscribe();
  }, [currentWeekISO, actualIsPrimarySuperAdmin]);

  useEffect(() => {
    if (!actualIsPrimarySuperAdmin) return undefined;
    const unsubscribe = onSnapshot(collection(db, "rosterOptions"), (snapshot) => {
      const grouped = { manager: [], location: [] };
      snapshot.forEach((docRef) => {
        const data = docRef.data();
        if (
          typeof data?.type === "string" &&
          typeof data?.value === "string" &&
          grouped[data.type]
        ) {
          grouped[data.type].push(data.value.trim());
        }
      });

      setOptions({
        manager: sortByLabel(grouped.manager.filter(Boolean)),
        location: sortByLabel(grouped.location.filter(Boolean)),
      });
    });
    return () => unsubscribe();
  }, [actualIsPrimarySuperAdmin]);

  const managerOptions = useMemo(() => {
    const values = new Set(options.manager);
    reps.forEach((rep) => {
      if (rep.manager) values.add(rep.manager.trim());
    });
    users.forEach((entry) => {
      if (entry.team) values.add(entry.team.trim());
      else if (entry.manager) values.add(entry.manager.trim());
    });
    return sortByLabel(Array.from(values).filter(Boolean));
  }, [options.manager, reps, users]);

  const locationOptions = useMemo(() => {
    const values = new Set(options.location);
    reps.forEach((rep) => {
      if (rep.team) values.add(rep.team.trim());
    });
    users.forEach((entry) => {
      if (entry.location) values.add(entry.location.trim());
    });
    return sortByLabel(Array.from(values).filter(Boolean));
  }, [options.location, reps, users]);

  const filteredUsers = useMemo(() => {
    const searchValue = userSearch.trim().toLowerCase();

    return users.filter((account) => {
      const accountTeam = account.team || account.manager || "";
      const accountLocation = account.location || "";
      const matchesSearch =
        !searchValue ||
        [
          account.email,
          account.id,
          account.repName,
          accountTeam,
          accountLocation,
          account.role,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchValue);

      const matchesTeam = !userTeamFilter || accountTeam === userTeamFilter;
      const matchesLocation = !userLocationFilter || accountLocation === userLocationFilter;

      return matchesSearch && matchesTeam && matchesLocation;
    });
  }, [userLocationFilter, userSearch, userTeamFilter, users]);

  const currentUid = user?.uid || "";

  useEffect(() => {
    setProfileForm({
      repName: profile?.repName || "",
      phone: profile?.phone || "",
    });
  }, [profile?.phone, profile?.repName]);

  const applyRolePreset = (roleValue) => {
    const roleConfig = ROLE_OPTIONS.find((role) => role.value === roleValue) || DEFAULT_ROLE;
    setForm((prev) => ({
      ...prev,
      role: roleConfig.value,
      ...roleConfig.permissions,
    }));
  };

  const prefillFromRep = (rep) => {
    if (!rep) return;
    setUserError("");
    setUserSuccess("");
    setForm((prev) => ({
      ...prev,
      email: rep.email || prev.email,
      password: "",
      role: "user",
      repId: rep.id,
      repName: rep.name || "",
      team: rep.manager || "",
      location: rep.team || "",
      ...DEFAULT_ROLE.permissions,
    }));
    setCreateUserOpen(true);
  };

  const handleRepSelection = (repId) => {
    if (!repId) {
      setForm((prev) => ({
        ...prev,
        repId: "",
        repName: "",
      }));
      return;
    }

    const rep = reps.find((entry) => entry.id === repId);
    if (rep) prefillFromRep(rep);
  };

  const linkedUserForRep = (rep) =>
    users.find(
      (entry) =>
        entry.repId === rep.id ||
        (normalizeEmail(entry.email) &&
          normalizeEmail(rep.email) &&
          normalizeEmail(entry.email) === normalizeEmail(rep.email))
    );

  const createUser = async (event) => {
    event.preventDefault();
    setUserError("");
    setUserSuccess("");

    const email = normalizeEmail(form.email);
    const password = form.password;
    if (!email || !password) {
      setUserError("Email and password are required.");
      return;
    }
    if (password.length < 6) {
      setUserError("Password must be at least 6 characters.");
      return;
    }

    setSavingUser(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          role: form.role,
          repId: form.repId,
          repName: form.repName,
          team: form.team,
          location: form.location,
          manager: form.team,
          canEditSales: !!form.canEditSales,
          canEditKnocks: !!form.canEditKnocks,
          canEditRoster: !!form.canEditRoster,
          canEditOnboarding: !!form.canEditOnboarding,
          canEditReps: !!form.canEditReps,
          canCreateUsers: !!form.canCreateUsers,
          canViewPerformance: !!form.canViewPerformance,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || "Failed to create user.");
      }

      setForm(buildEmptyForm());
      setCreateUserOpen(false);
      setUserSuccess(`Created Firebase Auth user ${email}.`);
    } catch (err) {
      setUserError(err?.message || "Failed to create user.");
    } finally {
      setSavingUser(false);
    }
  };

  const openEditUserModal = (account) => {
    setEditUserForm(buildEditUserForm(account));
  };

  const applyEditRolePreset = (roleValue) => {
    const roleConfig = ROLE_OPTIONS.find((role) => role.value === roleValue) || DEFAULT_ROLE;
    setEditUserForm((prev) =>
      prev
        ? {
            ...prev,
            role: roleConfig.value,
            ...roleConfig.permissions,
          }
        : prev
    );
  };

  const handleEditUserRepChange = (repId) => {
    setEditUserForm((prev) => {
      if (!prev) return prev;
      if (!repId) {
        return {
          ...prev,
          repId: "",
          repName: "",
        };
      }

      const rep = reps.find((entry) => entry.id === repId);
      if (!rep) return prev;

      return {
        ...prev,
        repId: rep.id,
        repName: rep.name || "",
        team: rep.manager || prev.team || "",
        location: rep.team || prev.location || "",
      };
    });
  };

  const saveEditUser = async () => {
    if (!editUserForm?.id) return;

    const roleConfig =
      ROLE_OPTIONS.find((role) => role.value === editUserForm.role) || DEFAULT_ROLE;

    setSavingEditUser(true);
    try {
      await updateDoc(doc(db, "adminUsers", editUserForm.id), {
        role: roleConfig.value,
        roleLabel: roleConfig.label,
        repId: editUserForm.repId || "",
        repName: editUserForm.repName || "",
        team: editUserForm.team || "",
        manager: editUserForm.team || "",
        location: editUserForm.location || "",
        canEditSales: !!editUserForm.canEditSales,
        canEditKnocks: !!editUserForm.canEditKnocks,
        canEditRoster: !!editUserForm.canEditRoster,
        canEditOnboarding: !!editUserForm.canEditOnboarding,
        canEditReps: !!editUserForm.canEditReps,
        canCreateUsers: !!editUserForm.canCreateUsers,
        canViewPerformance: !!editUserForm.canViewPerformance,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      setEditUserForm(null);
    } catch (err) {
      alert(err?.message || "Failed to update user.");
    } finally {
      setSavingEditUser(false);
    }
  };

  const removeUser = async (uid) => {
    if (!window.confirm("Remove this user profile?")) return;
    try {
      await deleteDoc(doc(db, "adminUsers", uid));
    } catch (err) {
      alert(err?.message || "Failed to remove user.");
    }
  };

  const saveOwnProfile = async (event) => {
    event.preventDefault();
    if (!user?.uid) return;

    const nextName = profileForm.repName.trim();
    const nextPhone = profileForm.phone.trim();
    if (!nextName) {
      setProfileError("Name is required.");
      setProfileSuccess("");
      return;
    }

    setSavingProfile(true);
    setProfileError("");
    setProfileSuccess("");

    try {
      await setDoc(
        doc(db, "adminUsers", user.uid),
        {
          repName: nextName,
          phone: nextPhone,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      setProfileSuccess("Profile updated.");
      setProfileEditing(false);
    } catch (err) {
      setProfileError(err?.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <LoadingPanel label="Loading settings" detail="Checking account permissions." />
      </PageShell>
    );
  }

  if (!actualIsPrimarySuperAdmin) {
    return (
      <PageShell>
        <PageHero
          eyebrow="Profile"
          title="Manage your account details."
          description="You can update your name and phone number here. All other settings stay locked to your assigned role."
          stats={[
            { label: "Role", value: isManager ? "Manager" : "User" },
            { label: "Name", value: profile?.repName || "Not set" },
            { label: "Team", value: profile?.team || "Not assigned" },
            { label: "Location", value: profile?.location || "Not assigned" },
          ]}
        />

        <section className="glass-panel p-5">
          <SectionIntro
            eyebrow="My Profile"
            title="Update your contact information."
            description="Only your name and phone number are editable in this view."
            actions={
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setProfileEditing((value) => !value);
                  setProfileError("");
                  setProfileSuccess("");
                  setProfileForm({
                    repName: profile?.repName || "",
                    phone: profile?.phone || "",
                  });
                }}
              >
                {profileEditing ? "Cancel" : "Edit"}
              </button>
            }
          />

          <form onSubmit={saveOwnProfile} className="mt-5 max-w-2xl space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  className="input input-bordered h-12 w-full"
                  type="text"
                  value={profileForm.repName}
                  disabled={!profileEditing}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, repName: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Phone Number</span>
                <input
                  className="input input-bordered h-12 w-full"
                  type="tel"
                  value={profileForm.phone}
                  disabled={!profileEditing}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Role</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {profile?.roleLabel || (isManager ? "Manager" : "User")}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Team</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{profile?.team || "Not assigned"}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Location</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {profile?.location || "Not assigned"}
                </p>
              </div>
            </div>

            {profileError ? (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {profileError}
              </div>
            ) : null}

            {profileSuccess ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {profileSuccess}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button className="btn btn-primary" type="submit" disabled={savingProfile || !profileEditing}>
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Admin Controls"
        title="Manage users, teams, and current reps."
        description="Create Firebase users, assign them to the right team and location, and maintain the current-week rep list that powers the sales dashboard."
        stats={[
          { label: "Users", value: users.length || 0 },
          { label: "Current Reps", value: reps.length || 0 },
          { label: "Week", value: currentWeekISO },
        ]}
      />

      <section className="glass-panel p-5">
        <SectionIntro
          eyebrow="User Access"
          title="Assign users to teams and current reps."
          description="Team maps to the rep manager, while location stays separate. Keep the user profiles tied to the same current-week rep data the dashboard already uses."
          actions={
            <div className="flex gap-2">
              <button className="btn btn-outline" type="button" onClick={() => setUserPanelOpen((value) => !value)}>
                {userPanelOpen ? "Collapse" : "Expand"}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setForm(buildEmptyForm());
                  setUserError("");
                  setUserSuccess("");
                  setCreateUserOpen(true);
                }}
                disabled={!actualIsPrimarySuperAdmin}
              >
                Create User
              </button>
            </div>
          }
        />

        {userSuccess ? (
          <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {userSuccess}
          </div>
        ) : null}

        {userPanelOpen ? (
        <>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
          <input
            className="input input-bordered h-11 w-full"
            type="search"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search email, rep, team, location, or UID"
          />
          <select
            className="select select-bordered h-11 min-h-11 w-full"
            value={userTeamFilter}
            onChange={(event) => setUserTeamFilter(event.target.value)}
          >
            <option value="">All teams</option>
            {managerOptions.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
          <select
            className="select select-bordered h-11 min-h-11 w-full"
            value={userLocationFilter}
            onChange={(event) => setUserLocationFilter(event.target.value)}
          >
            <option value="">All locations</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>

        <div className="data-table-shell mt-4">
          <div className="data-table-scroll">
            <table className="table table-sm w-full min-w-[980px] table-fixed">
              <thead className="bg-slate-100/90 text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200 [&>tr>th]:px-3">
                <tr>
                  <th className="w-[22%]">Email</th>
                  <th className="w-[10%]">Role</th>
                  <th className="w-[18%]">Rep</th>
                  <th className="w-[14%]">Team</th>
                  <th className="w-[14%]">Location</th>
                  <th className="w-[14%]">UID</th>
                  <th className="w-[8%]" />
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-slate-200 [&>tr>td]:px-3 [&>tr>td]:py-2.5">
                {filteredUsers.map((account) => {
                  const isSelf = account.id === currentUid;
                  return (
                    <tr key={account.id}>
                      <td className="truncate font-medium">{account.email || "Unknown"}</td>
                      <td>{ROLE_OPTIONS.find((role) => role.value === account.role)?.label || "User"}</td>
                      <td className="truncate">{account.repName || "No linked rep"}</td>
                      <td className="truncate">{account.team || account.manager || "No team"}</td>
                      <td className="truncate">{account.location || "No location"}</td>
                      <td className="truncate font-mono text-[11px] text-slate-500">{account.id}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn btn-outline btn-xs"
                            onClick={() => openEditUserModal(account)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => removeUser(account.id)}
                            disabled={isSelf}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm text-slate-500">
                      No user profiles matched the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        </>
        ) : null}
      </section>

      <section className="glass-panel p-5">
        <SectionIntro
          eyebrow="Current Reps"
          title="Create and edit the reps shown on the sales dashboard."
          description="Current reps still keep their manager and location fields. Team assignment for users now comes from the rep manager."
          actions={
            <div className="flex gap-2">
              <button className="btn btn-outline" type="button" onClick={() => setRepPanelOpen((value) => !value)}>
                {repPanelOpen ? "Collapse" : "Expand"}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setAddRepOpen(true)}>
                Add Current Rep
              </button>
            </div>
          }
        />

        {repPanelOpen ? (
        <div className="data-table-shell mt-5">
          <div className="data-table-scroll">
            <table className="table w-full min-w-[1100px]">
              <thead className="bg-slate-100/90 text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
                <tr>
                  <th>Rep</th>
                  <th>Email</th>
                  <th>Team</th>
                  <th>Location</th>
                  <th>Linked User</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-slate-200">
                {reps.map((rep) => {
                  const linkedUser = linkedUserForRep(rep);
                  return (
                    <tr key={rep.id}>
                      <td className="font-medium">{rep.name || "Unnamed rep"}</td>
                      <td>{rep.email || "No email"}</td>
                      <td>{rep.manager || "No team"}</td>
                      <td>{rep.team || "No location"}</td>
                      <td>{linkedUser?.email || "No linked user"}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => prefillFromRep(rep)}
                          >
                            Create User
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setRepToEdit(rep);
                              setEditRepOpen(true);
                            }}
                          >
                            Edit Rep
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {reps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                      No current reps found for {currentWeekISO}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}
      </section>

      <Modal open={createUserOpen} onClose={() => setCreateUserOpen(false)} maxWidth="max-w-4xl">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              User Access
            </p>
            <h3 className="text-2xl font-bold text-slate-950">Create User</h3>
            <p className="text-sm text-slate-600">
              Link the account to a current rep. Team maps to the rep manager, and location remains separate.
            </p>
          </div>

          <form onSubmit={createUser} className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_220px]">
              <select
                className="select select-bordered h-12 w-full"
                value={form.repId}
                onChange={(event) => handleRepSelection(event.target.value)}
              >
                <option value="">Link to current rep</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name || "Unnamed rep"}
                  </option>
                ))}
              </select>
              <input
                className="input input-bordered h-12 w-full"
                placeholder="User email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                className="input input-bordered h-12 w-full"
                placeholder="Temporary password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <select
                className="select select-bordered h-12 w-full"
                value={form.role}
                onChange={(event) => applyRolePreset(event.target.value)}
              >
                {ROLE_OPTIONS.filter((role) => actualIsPrimarySuperAdmin || role.value !== "admin").map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="input input-bordered h-12 w-full"
                placeholder="Rep name"
                value={form.repName}
                onChange={(event) => setForm((prev) => ({ ...prev, repName: event.target.value }))}
              />
              <select
                className="select select-bordered h-12 w-full"
                value={form.team}
                onChange={(event) => setForm((prev) => ({ ...prev, team: event.target.value }))}
              >
                <option value="">Team</option>
                {managerOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
              <select
                className="select select-bordered h-12 w-full"
                value={form.location}
                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              >
                <option value="">Location</option>
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {ROLE_OPTIONS.filter((role) => actualIsPrimarySuperAdmin || role.value !== "admin").map((role) => (
                <div
                  key={role.value}
                  className="rounded-[18px] border border-slate-200/70 bg-white/60 px-4 py-3"
                >
                  <p className="text-sm font-bold text-slate-900">{role.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{role.description}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PERMISSION_FIELDS.map(([key, label]) => (
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

            {userError ? (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {userError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setCreateUserOpen(false)} disabled={savingUser}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={savingUser}>
                {savingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <AddRepsModal
        open={addRepOpen}
        onClose={() => setAddRepOpen(false)}
        weekISO={currentWeekISO}
      />
      <EditRepsModal
        open={editRepOpen}
        onClose={() => {
          setEditRepOpen(false);
          setRepToEdit(null);
        }}
        base="weeks"
        weekISO={currentWeekISO}
        reps={repToEdit ? [repToEdit] : []}
      />

      <Modal
        open={!!editUserForm}
        onClose={() => setEditUserForm(null)}
        maxWidth="max-w-3xl"
      >
        {editUserForm ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                User Access
              </p>
              <h3 className="text-2xl font-bold text-slate-950">
                {editUserForm.email || "Edit user"}
              </h3>
              <p className="text-sm text-slate-600">
                Change role, linked rep, team, location, and permissions in one place.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  className="select select-bordered h-11 min-h-11 w-full"
                  value={editUserForm.role}
                  disabled={editUserForm.id === currentUid}
                  onChange={(event) => applyEditRolePreset(event.target.value)}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Linked Rep</span>
                <select
                  className="select select-bordered h-11 min-h-11 w-full"
                  value={editUserForm.repId}
                  onChange={(event) => handleEditUserRepChange(event.target.value)}
                >
                  <option value="">No linked rep</option>
                  {reps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name || "Unnamed rep"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Team</span>
                <select
                  className="select select-bordered h-11 min-h-11 w-full"
                  value={editUserForm.team}
                  onChange={(event) =>
                    setEditUserForm((prev) =>
                      prev ? { ...prev, team: event.target.value } : prev
                    )
                  }
                >
                  <option value="">No team</option>
                  {managerOptions.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Location</span>
                <select
                  className="select select-bordered h-11 min-h-11 w-full"
                  value={editUserForm.location}
                  onChange={(event) =>
                    setEditUserForm((prev) =>
                      prev ? { ...prev, location: event.target.value } : prev
                    )
                  }
                >
                  <option value="">No location</option>
                  {locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                UID
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-700">{editUserForm.id}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PERMISSION_FIELDS.map(([key, label]) => (
                <label
                  key={`${editUserForm.id}-${key}`}
                  className="flex items-center justify-between rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    className="toggle"
                    checked={!!editUserForm[key]}
                    onChange={(event) =>
                      setEditUserForm((prev) =>
                        prev ? { ...prev, [key]: event.target.checked } : prev
                      )
                    }
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setEditUserForm(null)}
                disabled={savingEditUser}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={saveEditUser}
                disabled={savingEditUser}
              >
                {savingEditUser ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageShell>
  );
}
