import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function LoginModal({ open, onClose }) {
  const [email, setEmail] = useState(""); 
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    try {
      await signInWithEmailAndPassword(auth, email, pwd);
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!open) return null;
  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="text-lg font-semibold">Admin Login</h3>
        <input className="input input-bordered w-full mt-4" placeholder="Email"
               value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="input input-bordered w-full mt-2" type="password" placeholder="Password"
               value={pwd} onChange={(e)=>setPwd(e.target.value)} />
        {err && <p className="mt-2 text-sm text-error">{err}</p>}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Login</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}> </div>
    </div>
  );
}
