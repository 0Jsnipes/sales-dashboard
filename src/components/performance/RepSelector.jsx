export default function RepSelector({ reps, selectedRep, onSelectRep }) {
  const uniqueReps = reps.filter((rep, idx, all) => {
    const normalizedName = rep.name.trim().toLowerCase();
    return all.findIndex((item) => item.name.trim().toLowerCase() === normalizedName) === idx;
  });

  return (
    <select
      value={selectedRep || ""}
      onChange={(e) => onSelectRep(e.target.value || null)}
      className="select select-bordered h-12 min-w-[220px] w-full"
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
