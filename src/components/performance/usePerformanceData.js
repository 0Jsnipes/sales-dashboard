import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useDemoMode } from "../../hooks/useDemoMode";
import { getDemoPerformanceData } from "../../demo/demoData.js";

const clampNum = (v) =>
  Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0;

const rangeDays = (range) => (range === "7d" ? 7 : range === "30d" ? 30 : 90);

const dayIndexForDate = (date) => (date.getUTCDay() + 6) % 7;

const weekISOForDate = (date) => {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - day);
  return utc.toISOString().slice(0, 10);
};

const repKeyFor = (rep) => {
  const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
  if (sid) return `sid:${sid}`;
  const name = (rep.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  if (rep.id) return `id:${rep.id}`;
  return null;
};

const buildDateRange = (days) => {
  const dates = [];
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const endUTC = new Date(todayUTC);
  endUTC.setUTCDate(todayUTC.getUTCDate() - 1);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endUTC);
    d.setUTCDate(endUTC.getUTCDate() - i);
    dates.push(d);
  }
  return dates;
};

const buildDashboardData = (dates, weekMap) => {
  const repsMap = new Map();
  const dailyData = dates.map((date) => {
    const dateISO = date.toISOString().slice(0, 10);
    const weekISO = weekISOForDate(date);
    const dayIndex = dayIndexForDate(date);
    const reps = weekMap.get(weekISO) || [];
    const dayEntry = { date: dateISO, reps: {} };

    reps.forEach((rep) => {
      const key = repKeyFor(rep);
      if (!key) return;

      const knocksArr = Array.isArray(rep.knocks) ? rep.knocks : [];
      const salesArr = Array.isArray(rep.sales) ? rep.sales : [];
      const knocks = clampNum(knocksArr[dayIndex]);
      const sales = clampNum(salesArr[dayIndex]);

      if (!dayEntry.reps[key]) {
        dayEntry.reps[key] = { knocks: 0, sales: 0 };
      }
      dayEntry.reps[key].knocks += knocks;
      dayEntry.reps[key].sales += sales;

      const existing = repsMap.get(key) || {
        id: key,
        name: rep.name || key,
        knocks: 0,
        sales: 0,
        daysActive: 0,
        _activeDays: new Set()
      };

      existing.name = rep.name || existing.name;
      existing.knocks += knocks;
      existing.sales += sales;
      if (knocks > 0 || sales > 0) {
        existing._activeDays.add(dateISO);
      }

      repsMap.set(key, existing);
    });

    return dayEntry;
  });

  let totalKnocks = 0;
  let totalSales = 0;

  const reps = Array.from(repsMap.values())
    .map((rep) => {
      const daysActive = rep._activeDays.size;
      totalKnocks += rep.knocks;
      totalSales += rep.sales;
      return {
        id: rep.id,
        name: rep.name,
        knocks: rep.knocks,
        sales: rep.sales,
        daysActive
      };
    })
    .sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base"
      })
    );

  const lastDay = dailyData[dailyData.length - 1];
  const activeReps = lastDay
    ? Object.values(lastDay.reps).filter(
        (r) => (r?.knocks || 0) > 0 || (r?.sales || 0) > 0
      ).length
    : 0;
  const avgDaysActive = reps.length
    ? reps.reduce((sum, rep) => sum + rep.daysActive, 0) / reps.length
    : 0;
  const conversionRate = totalKnocks > 0 ? (totalSales / totalKnocks) * 100 : 0;

  return {
    reps,
    dailyData,
    companyKPIs: {
      totalKnocks,
      totalSales,
      conversionRate,
      avgDaysActive,
      activeReps
    }
  };
};

export function usePerformanceData(dateRange) {
  const isDemo = useDemoMode();
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null
  });

  useEffect(() => {
    if (isDemo) {
      setState({
        loading: false,
        data: getDemoPerformanceData(dateRange),
        error: null
      });
      return undefined;
    }

    let active = true;
    setState({ loading: true, data: null, error: null });

    const dates = buildDateRange(rangeDays(dateRange));
    const weekISOs = Array.from(
      new Set(dates.map((date) => weekISOForDate(date)))
    ).sort();

    const weekMap = new Map();
    const unsubs = [];

    const recompute = () => {
      if (!active) return;
      const data = buildDashboardData(dates, weekMap);
      setState({ loading: false, data, error: null });
    };

    const handleError = (err) => {
      if (!active) return;
      console.error("Failed to load performance data", err);
      setState({ loading: false, data: null, error: err });
    };

    if (weekISOs.length === 0) {
      recompute();
      return undefined;
    }

    weekISOs.forEach((weekISO) => {
      const unsub = onSnapshot(
        collection(db, "weeks", weekISO, "reps"),
        (snap) => {
          weekMap.set(
            weekISO,
            snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          );
          recompute();
        },
        handleError
      );
      unsubs.push(unsub);
    });

    return () => {
      active = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, [dateRange, isDemo]);

  return state;
}
