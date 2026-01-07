export default function RepSelector({ reps, selectedRep, onSelectRep }) {
  const uniqueReps = reps.filter((rep, idx, all) => {
    const normalizedName = rep.name.trim().toLowerCase();
    return all.findIndex((item) => item.name.trim().toLowerCase() === normalizedName) === idx;
  });

  return (
    <select
      value={selectedRep || ""}
      onChange={(e) => onSelectRep(e.target.value || null)}
      className="min-w-[200px] rounded-xl border border-base-300 bg-base-100 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <option value="">All Reps</option>
      {uniqueReps.map((rep) => (
        <option key={rep.id} value={rep.id}>
          {rep.name}
        </option>
      ))}
    </select>
  );
}
