import { useEffect } from "react";

interface SuccessOverlayProps {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
}

// Full-screen green flash + animated checkmark, shown right after a confirm
// action succeeds — mirrors the "payment successful" feel of apps like GPay.
export default function SuccessOverlay({ message, onDone, durationMs = 1800 }: SuccessOverlayProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [message, onDone, durationMs]);

  if (!message) return null;

  return (
    <div
      className="success-overlay fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-success px-6 text-center"
      onClick={onDone}
      role="status"
    >
      <div className="success-overlay-badge flex size-24 items-center justify-center rounded-full bg-white/15">
        <svg viewBox="0 0 52 52" className="size-14" fill="none">
          <circle
            cx="26"
            cy="26"
            r="24"
            stroke="white"
            strokeWidth="3"
            className="success-overlay-circle"
          />
          <path
            d="M14 27l7 7 16-16"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="success-overlay-check"
          />
        </svg>
      </div>
      <p className="text-lg font-semibold text-white">{message}</p>
    </div>
  );
}
