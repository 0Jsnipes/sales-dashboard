export default function RepSelector({
  reps,
  selectedRep,
  onSelectRep,
  selectedRepFallback = null,
}) {
  const uniqueReps = reps.filter((rep, idx, all) => {
    const normalizedName = rep.name.trim().toLowerCase();
    return all.findIndex((item) => item.name.trim().toLowerCase() === normalizedName) === idx;
  })
    .slice()
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      })
    );
  const hasSelectedRep = uniqueReps.some((rep) => rep.id === selectedRep);
  const repsWithFallback =
    selectedRep && selectedRepFallback && !hasSelectedRep
      ? [selectedRepFallback, ...uniqueReps]
      : uniqueReps;

  return (
    <select
      value={selectedRep || ""}
      onChange={(e) => onSelectRep(e.target.value || null)}
      className="select select-bordered h-12 min-w-[220px] w-full"
    >
      <option value="">All Reps</option>
      {repsWithFallback.map((rep) => (
        <option key={rep.id} value={rep.id}>
          {rep.name}
        </option>
      ))}
    </select>
  );
}
