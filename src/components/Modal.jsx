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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`w-[92vw] ${maxWidth} rounded-2xl bg-base-100 p-6 shadow-xl`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
