import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import Modal from "./Modal.jsx";

/**
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 */

function getLoginErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/missing-password":
      return "Enter the password for this account.";
    case "auth/user-disabled":
      return "This account has been disabled in Firebase Auth.";
    case "auth/user-not-found":
      return "No Firebase Auth account exists for this email.";
    case "auth/wrong-password":
      return "The password is incorrect.";
    case "auth/invalid-credential":
      return "The email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Try again later or reset the password.";
    case "auth/network-request-failed":
      return "Network error while contacting Firebase. Try again.";
    default:
      return error?.message || "Login failed.";
  }
}

export default function LoginModal({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const login = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    setErr("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, pw);
      onClose();
    } catch (e) {
      setErr(getLoginErrorMessage(e));
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
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={login} disabled={busy}>
          {busy ? "Signing in..." : "Login"}
        </button>
      </div>
    </Modal>
  );
}
