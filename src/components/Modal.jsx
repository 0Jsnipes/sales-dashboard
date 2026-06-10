import { createPortal } from "react-dom";

/**
 * Simple centered modal rendered via React portal.
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - maxWidth: tailwind class (e.g., "max-w-2xl" | "max-w-sm")
 */
export default function Modal({ open, onClose, maxWidth = "max-w-2xl", children }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={`w-[94vw] ${maxWidth} max-h-[90vh] overflow-y-auto rounded-[30px] border border-white/60 bg-white/88 p-5 shadow-[0_36px_80px_rgba(9,20,35,0.22)] backdrop-blur-2xl sm:p-6`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
