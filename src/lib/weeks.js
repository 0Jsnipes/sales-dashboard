import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { DAYS, prevWeekISO } from "../utils/weeks.js";

/** Base is ALWAYS "weeks" now (shared reps for sales/knocks). */
export async function ensureWeek(weekISO) {
  const metaRef = doc(db, "weeks", weekISO, "metainfo", "meta");
  const snap = await getDoc(metaRef);
  if (!snap.exists()) {
    await setDoc(metaRef, { startISO: weekISO, days: DAYS });
  }
}

/** If empty, clone reps from previous week, carrying goals for BOTH metrics. */
export async function ensureWeekWithAutoclone(weekISO) {
  await ensureWeek(weekISO);

  const repsSnap = await getDocs(collection(db, "weeks", weekISO, "reps"));
  if (!repsSnap.empty) return;

  const lastISO = prevWeekISO(weekISO);
  const lastReps = await getDocs(collection(db, "weeks", lastISO, "reps"));
  if (lastReps.empty) return;

  const writes = [];
  lastReps.forEach((r) => {
    const data = r.data();
    const repRef = doc(collection(db, "weeks", weekISO, "reps"));
    writes.push(setDoc(repRef, {
      name: data.name,
      team: data.team || "",
      manager: data.manager || "",
      // carry both goals
      salesGoal: Number(data.salesGoal || 0),
      knocksGoal: Number(data.knocksGoal || 0),
      // reset both arrays
      sales: [0,0,0,0,0,0,0],
      knocks: [0,0,0,0,0,0,0],
    }));
  });
  await Promise.all(writes);
}
