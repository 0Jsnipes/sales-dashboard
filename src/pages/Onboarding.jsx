import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const sections = [
  {
    title: "Program",
    buttons: [
      {
        label: "T-fiber",
        colorClass: "bg-pink-500 hover:bg-pink-600 text-white",
        link: "https://magentaportal.t-mobile.com/logon/LogonPoint/tmindex.html",
      },
      {
        label: "AT&T",
        colorClass: "bg-sky-500 hover:bg-sky-600 text-white",
        link: "https://www.saraplus.com/e/(S(rmltpvfmpjwr4z2esggfydpx))/ServicePages/Login.aspx?ReturnUrl=%2fe%2fReports%2fReportingHub.aspx",
      },
      {
        label: "Frontier",
        colorClass: "bg-rose-600 hover:bg-rose-700 text-white",
        link: "https://perfectvisionpoe.my.site.com/poe/s/login/",
      },
    ],
  },
  {
    title: "Background",
    buttons: [
      {
        label: "Background checks - T-fiber",
        colorClass: "bg-pink-500 text-white hover:bg-pink-600",
        link: "https://simpliverified.instascreen.net/sso/login.taz",
      },
    ],
  },
  {
    title: "UID",
    buttons: [
      {
        label: "Residential",
        colorClass: "bg-sky-500 hover:bg-sky-600 text-white",
        link: "https://form.jotform.com/222554092601146",
      },
      {
        label: "Commercial",
        colorClass: "bg-sky-500 hover:bg-sky-600 text-white",
        link: "https://form.jotform.com/233545154870155",
      },
      {
        label: "DTV",
        colorClass: "bg-sky-500 hover:bg-sky-600 text-white",
        link: "https://form.jotform.com/222575485783166",
      },
    ],
  },
];

const emailTemplates = [
  {
    key: "att-onboarding",
    title: "AT&T Onboarding",
    subject: "AT&T Onboarding | Next Steps",
    body: `Hello!

Below is the link that will begin your onboarding process with AT&T, as well as an explanation of steps during this process.

** Please visit our AT&T Training Google Drive to view all of your program’s training documents. (Add your drive link here)

** After training you must pass this QUIZ with 100% to get credentials. (Add your quiz link here)

After submitting the links, you will be uploaded as a new user for SaraPlus. You will receive an email that will have your credentials and Temporary Password to set up your account. After you have completed your account creation, you will be sent to the homepage of SaraPlus. You are now able to proceed with using SaraPlus for order entries!

Onboarding Link: https://abenergymarketing.com/fiber

On your credentials email, there will be training information. There will be a lot of important information, tips, and promotional flyers available to you. Please review and utilize it once you receive it.`,
  },
  {
    key: "att-onboarding-sub",
    title: "AT&T Onboarding - Sub",
    subject: "AT&T Onboarding | Sub Program",
    body: `Hello!

Below is the link that will begin your onboarding process with AT&T, as well as an explanation of steps during this process.

** Please visit our AT&T Training Google Drive to view all of your program’s training documents. (Add your drive link here)

** After training you must pass this QUIZ with 100% to get credentials. (Add your quiz link here)

After submitting the links, you will be uploaded as a new user for SaraPlus. You will receive an email that will have your credentials and Temporary Password to set up your account. After you have completed your account creation, you will be sent to the homepage of SaraPlus. You are now able to proceed with using SaraPlus for order entries!

Onboarding Link: https://abenergymarketing.com/fiber-sub

On your credentials email, there will be training information. There will be a lot of important information, tips, and promotional flyers available to you. Please review and utilize it once you receive it.`,
  },
  {
    key: "welcome-att",
    title: "Welcome ATT",
    subject: "Welcome to AT&T",
    body: `Hi {{name}},

Welcome to the AT&T program! (Customize your welcome message here.)`,
  },
  {
    key: "tfiber-onboarding",
    title: "T-Fiber Onboarding",
    subject: "T-Fiber / DIRECTV Onboarding",
    body: `Hello,
Welcome aboard! Below you’ll find the link to begin your onboarding process for T-Fiber and DIRECTV. Please follow the steps carefully to ensure a smooth setup and quick start in the field.

Review Your Training Materials: Visit the T-Fiber Training Google Drive to access all program training documents for T-fiber and DTV. The Drive contains essential information, tips, and product knowledge that will help you succeed. Please take the time to review all materials thoroughly.

Account Setup in SaraPlus: Once you’ve submitted your onboarding link, our admin team will upload you as a new user in SaraPlus. You’ll then receive an email containing your SaraPlus credentials and a temporary password to log in and set up your account. After creating your password and logging in, you’ll be redirected to the SaraPlus homepage — from there, you’ll be ready to begin DIRECTV order entry.

Onboarding Link: https://abenergymarketing.com/fiber

If you encounter any issues or have questions during this process, reach out to your onboarding coordinator right away — we’re here to help you get set up and earning fast.
Welcome to the team and congratulations on joining the T-Fiber and DIRECTV program!`,
  },
  {
    key: "tfiber-onboarding-sub",
    title: "T-Fiber Onboarding - Sub",
    subject: "T-Fiber / DIRECTV Onboarding (Sub)",
    body: `Hello,
Welcome aboard! Below you’ll find the link to begin your onboarding process for T-Fiber and DIRECTV. Please follow the steps carefully to ensure a smooth setup and quick start in the field.

Review Your Training Materials: Visit the T-Fiber Training Google Drive to access all program training documents for T-fiber and DTV. The Drive contains essential information, tips, and product knowledge that will help you succeed. Please take the time to review all materials thoroughly.

Account Setup in SaraPlus: Once you’ve submitted your onboarding link, our admin team will upload you as a new user in SaraPlus. You’ll then receive an email containing your SaraPlus credentials and a temporary password to log in and set up your account. After creating your password and logging in, you’ll be redirected to the SaraPlus homepage — from there, you’ll be ready to begin DIRECTV order entry.

Onboarding Link: https://abenergymarketing.com/fiber-sub

If you encounter any issues or have questions during this process, reach out to your onboarding coordinator right away — we’re here to help you get set up and earning fast.
Welcome to the team and congratulations on joining the T-Fiber and DIRECTV program!`,
  },
  {
    key: "tfiber-asm",
    title: "T-Fiber ASM",
    subject: "T-Fiber ASM Onboarding",
    body: `Hello,
Welcome aboard! Below you’ll find the link to begin your onboarding process for T-Fiber and DIRECTV. Please follow the steps carefully to ensure a smooth setup and quick start in the field.

Review Your Training Materials: Visit the T-Fiber Training Google Drive to access all program training documents for T-fiber and DTV. The Drive contains essential information, tips, and product knowledge that will help you succeed. Please take the time to review all materials thoroughly.

Account Setup in SaraPlus: Once you’ve submitted your onboarding link, our admin team will upload you as a new user in SaraPlus. You’ll then receive an email containing your SaraPlus credentials and a temporary password to log in and set up your account. After creating your password and logging in, you’ll be redirected to the SaraPlus homepage — from there, you’ll be ready to begin DIRECTV order entry.

Onboarding Link: 
https://abenergymarketing.com/fiber

If you encounter any issues or have questions during this process, reach out to your onboarding coordinator right away — we’re here to help you get set up and earning fast.
Welcome to the team and congratulations on joining the T-Fiber and DIRECTV program!`,
  },
];

const programTasks = {
  att: ["onboadingSent", "adp", "saraplus", "uid"],
  tfiber: ["onboadingSent", "adp", "clear", "dtv", "submitted", "backgroundCheck"],
  frontier: ["onboadingSent", "adp", "dtv", "submitted", "headshot"],
  other: ["onboadingSent", "adp", "clear", "dtv", "submitted", "backgroundCheck"],
};

const labelMap = {
  onboadingSent: "Onboarding Sent",
  adp: "ADP",
  saraplus: "SaraPlus",
  uid: "UID",
  clear: "Clear",
  dtv: "DTV",
  submitted: "Submitted",
  backgroundCheck: "Background Check",
  headshot: "Headshot",
};

const normalizeProgram = (program) => {
  const p = (program || "").toLowerCase();
  if (p.includes("att") || p.includes("at&t")) return "att";
  if (p.includes("fiber")) return "tfiber";
  if (p.includes("frontier")) return "frontier";
  return "other";
};

export default function OnboardingPage() {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(emailTemplates[0].key);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "roster"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRoster(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const grouped = useMemo(() => {
    const buckets = { att: [], tfiber: [], frontier: [], other: [] };
    roster.forEach((rep) => {
      const key = normalizeProgram(rep.program);
      const onboarding = rep.onboarding || {};
      if (onboarding.onboarded !== false) return; // only show not onboarded
      const tasks = programTasks[key] || [];
      const checksRaw = onboarding.checks || {};
      const checks = {};
      tasks.forEach((t) => {
        checks[t] = !!checksRaw[t];
      });
      const completed = tasks.filter((t) => checks[t]).length;
      buckets[key].push({
        ...rep,
        programKey: key,
        tasks,
        checks,
        progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      });
    });
    return buckets;
  }, [roster]);

  const handleToggle = async (rep, task) => {
    const current = rep.checks[task];
    const next = !current;
    const tasks = rep.tasks;
    const done = tasks.every((t) => (t === task ? next : rep.checks[t]));
    try {
      await updateDoc(doc(db, "roster", rep.id), {
        [`onboarding.checks.${task}`]: next,
        "onboarding.onboarded": done ? true : false,
      });
    } catch (err) {
      console.error("Failed to update onboarding check", err);
      alert("Failed to update onboarding. Check console for details.");
    }
  };

  const totalRows =
    grouped.att.length + grouped.tfiber.length + grouped.frontier.length + grouped.other.length;

  const fillTemplate = (str, rep) => {
    const map = {
      name: rep.name || "",
      program: rep.program || "",
      manager: rep.manager || "",
      background_link: "",
      uid_link: "",
      dtv_link: "",
      missing_items: "",
      open_items: "",
    };
    return str.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => map[key.trim()] ?? "");
  };

  const buildMailto = (template, rep = null) => {
    const subj = rep ? fillTemplate(template.subject, rep) : template.subject;
    const body = rep ? fillTemplate(template.body, rep) : template.body;
    const to = rep?.email ? encodeURIComponent(rep.email) : "";
    const subject = encodeURIComponent(subj);
    const bodyEnc = encodeURIComponent(body);
    return `mailto:${to}?subject=${subject}&body=${bodyEnc}`;
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6 rounded-3xl bg-white/60 p-6 shadow-lg backdrop-blur">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Onboarding Hub
          </h1>
          <p className="text-sm text-slate-600">
            Quick links to program resources. Click a button to open the corresponding page (links to be added).
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {section.title}
                </h2>
                <div className="h-1 w-12 rounded-full bg-gradient-to-r from-slate-200 to-slate-300" />
              </div>
              <div className="flex flex-col gap-3">
                {section.buttons.map((btn) => (
                  <a
                    key={btn.label}
                    href={btn.link}
                    className={`btn mx-auto w-64 justify-center text-center rounded-full border-0 text-sm font-semibold shadow ${btn.colorClass}`}
                    role="button"
                  >
                    {btn.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Onboarding Progress
              </h2>
              <p className="text-xs text-slate-500">
                Reps not yet fully onboarded, grouped by program.
              </p>
            </div>
            <span className="badge badge-outline">
              {loading ? "Loading..." : `${totalRows} reps`}
            </span>
          </div>

          {["att", "tfiber", "frontier", "other"].map((key) => {
            const reps = grouped[key];
            if (!reps.length) return null;
            const headerLabel =
              key === "att"
                ? "AT&T"
                : key === "tfiber"
                ? "T-Fiber"
                : key === "frontier"
                ? "Frontier"
                : "Other";
            const tasks = programTasks[key];
            return (
              <div key={key} className="mb-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                  <h3 className="text-sm font-semibold text-slate-700">{headerLabel}</h3>
                  <span className="text-xs text-slate-500">{reps.length} reps</span>
                </div>
                <table className="table w-full">
                  <thead className="bg-slate-100/90 text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
                    <tr>
                      <th className="min-w-[120px] text-center">Name</th>
                      <th className="min-w-[100px] text-center">Sales ID</th>
                      <th className="min-w-[100px] text-center">Progress</th>
                      <th className="min-w-[140px] text-center">Email</th>
                      {tasks.map((t) => (
                        <th key={t} className="min-w-[110px] text-center">
                          {labelMap[t]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody
                    className="
                      [&>tr:nth-child(odd)]:bg-white
                      [&>tr:nth-child(even)]:bg-slate-50
                      [&>tr>td]:border-b [&>tr>td]:border-slate-200
                    "
                  >
                    {reps.map((rep) => (
                      <tr key={rep.id}>
                        <td className="text-center font-medium">{rep.name}</td>
                        <td className="text-center text-sm">{rep.salesId}</td>
                        <td className="text-center">
                          <div className="mx-auto h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${rep.progress}%` }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {rep.progress}%
                          </div>
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <select
                              className="select select-xs select-bordered"
                              value={selectedTemplate}
                              onChange={(e) => setSelectedTemplate(e.target.value)}
                            >
                              {emailTemplates.map((tpl) => (
                                <option key={tpl.key} value={tpl.key}>
                                  {tpl.title}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-xs bg-sky-500 text-white hover:bg-sky-600 hover:scale-105 transition"
                              title={rep.email ? `Send to ${rep.email}` : "No email on file"}
                              onClick={(e) => {
                                e.preventDefault();
                                const tpl =
                                  emailTemplates.find((t) => t.key === selectedTemplate) ||
                                  emailTemplates[0];
                                const mailto = buildMailto(tpl, rep);
                                window.location.href = mailto;
                              }}
                            >
                              Send
                            </button>
                          </div>
                        </td>
                        {tasks.map((t) => (
                          <td key={t} className="text-center">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={!!rep.checks[t]}
                              onChange={() => handleToggle(rep, t)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
