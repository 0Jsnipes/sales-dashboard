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
    <Modal open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Secure Access
          </p>
          <h3 className="text-2xl font-bold text-slate-950">Sign In</h3>
          <p className="text-sm text-slate-600">
            Sign in with your Firebase credentials to open the tools assigned to your role.
          </p>
        </div>

        <div className="grid gap-3">
          <input
            className="input input-bordered h-12 w-full"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input input-bordered h-12 w-full"
            placeholder="Password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>

        {err ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {err}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" onClick={login} disabled={busy} type="button">
            {busy ? "Signing in..." : "Login"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
