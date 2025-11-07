import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { todayId } from "../utils/date";

export default function SalesTable({ isAdmin }) {
  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "days", todayId(), "reps"), (s) => {
      setRows(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const updateSales = async (id, sales) => {
    await setDoc(doc(db, "days", todayId(), "reps", id), { sales, name: rows.find(r=>r.id===id)?.name }, { merge: true });
  };

  const addRep = async () => {
    if (!newName.trim()) return;
    await addDoc(collection(db, "days", todayId(), "reps"), { name: newName.trim(), sales: 0 });
    setNewName("");
  };

  const removeRep = async (id) => {
    await deleteDoc(doc(db, "days", todayId(), "reps", id));
  };

  return (
    <div className="rounded-2xl bg-base-100 p-4 shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Today's Sales</h2>
        {isAdmin && (
          <div className="flex gap-2">
            <input className="input input-bordered input-sm" placeholder="New rep name"
                   value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <button className="btn btn-sm btn-primary" onClick={addRep}>Add</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="table table-zebra">
          <thead>
          <tr><th>Rep</th><th>Sales</th>{isAdmin && <th></th>}</tr>
          </thead>
          <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="font-medium">{r.name}</td>
              <td className="w-48">
                {isAdmin ? (
                  <input type="number" min="0" className="input input-bordered input-sm w-28"
                         defaultValue={r.sales ?? 0}
                         onBlur={(e)=>updateSales(r.id, Number(e.target.value || 0))} />
                ) : (
                  <span>{r.sales ?? 0}</span>
                )}
              </td>
              {isAdmin && (
                <td className="text-right">
                  <button className="btn btn-ghost btn-xs" onClick={()=>removeRep(r.id)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
