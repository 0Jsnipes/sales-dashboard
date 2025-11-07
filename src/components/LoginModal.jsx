import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import Modal from "./Modal.jsx";

/**
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 */
export default function LoginModal({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const login = async () => {
    setErr(""); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      onClose();
    } catch (e) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-sm bg-white">
      <h3 className="text-lg font-semibold">Admin Login</h3>
      <div className="mt-4 grid gap-3">
        <input
          className="input input-bordered"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input input-bordered"
          placeholder="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </div>
      {err && <p className="mt-2 text-sm text-error">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={login} disabled={busy}>
          {busy ? "Signing in…" : "Login"}
        </button>
      </div>
    </Modal>
  );
}
