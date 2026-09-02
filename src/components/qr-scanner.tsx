import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";

// Scans a QR/barcode via the device camera and hands the decoded text to
// `onDecode`, which does the actual lookup (tire Material, warehouse key, ...)
// and resolves to whether it matched. Decoding runs client-side (jsQR against
// canvas frames) so it works the same in the browser and inside the
// Capacitor WebView.
export default function QrScanner({
  title,
  notFoundLabel,
  onDecode,
  onClose,
}: {
  title: string;
  notFoundLabel: string;
  onDecode: (code: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  // Kept in a ref (rather than a camera-setup effect dependency) so a fresh
  // onDecode closure each render — it closes over the page's live state —
  // doesn't tear down and restart the camera stream on every keystroke.
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  // Phones vary widely in camera resolution and CPU headroom, so the decode
  // work is deliberately throttled and downscaled — decoding every frame at
  // full camera resolution would burn battery and can visibly lag on
  // low/mid-range Android devices. 80ms still leaves plenty of headroom
  // while feeling near-instant.
  const SCAN_INTERVAL_MS = 80;
  const MAX_DECODE_WIDTH = 640;

  // A single sharp high-pitched beep played whenever any code is decoded
  // (matched or not) — the classic retail laser-scanner "beep" (single square
  // wave tone, near-instant attack/decay) rather than a soft musical chime.
  // Built with WebAudio instead of an audio file, so there's nothing to
  // bundle and it works offline the same in the browser and the Capacitor
  // WebView.
  const playScanChime = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 2800;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.004);
    gain.gain.setValueAtTime(0.18, now + 0.075);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  };

  useEffect(() => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    const ctx = AudioCtx ? new AudioCtx() : null;
    audioCtxRef.current = ctx;
    return () => {
      void ctx?.close();
    };
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access isn't supported on this device.");
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;
    let lastScan = 0;
    // Tracks the last decoded text so the chime fires once per code, not on
    // every ~80ms tick the same code sits in frame. A single missed frame
    // (motion blur, autofocus hiccup) shouldn't count as "gone" — only clear
    // it after the code hasn't been seen for a bit, via a debounced timer.
    let lastCode: string | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    // Guards against firing a second lookup while the first is still
    // in flight (Supabase lookups are async, unlike the old in-memory match).
    let busy = false;

    const scheduleReset = () => {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        lastCode = null;
      }, 1000);
    };

    const tick = (time: number) => {
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && time - lastScan >= SCAN_INTERVAL_MS) {
        lastScan = time;
        const canvas = canvasRef.current;
        const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data && code.data !== lastCode && !busy) {
            lastCode = code.data;
            scheduleReset();
            playScanChime();
            busy = true;
            const scanned = code.data;
            onDecodeRef.current(scanned).then((matched) => {
              busy = false;
              if (matched) {
                onClose();
              } else {
                setNotFound(scanned);
              }
            });
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            "Camera access is blocked for this app. Open your phone's Settings > Apps > Crown Pvt. Ltd. > Permissions > Camera and set it to Allow, then reopen this scanner."
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No camera was found on this device.");
        } else {
          setError("Couldn't access the camera — check permissions and try again.");
        }
      });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resetTimer) clearTimeout(resetTimer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close scanner" className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">{error}</div>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black aspect-square">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" />
          </div>
        )}

        {notFound && (
          <p className="text-xs text-danger">
            Scanned "{notFound}" — no {notFoundLabel} matches that code.
          </p>
        )}
      </div>
    </div>
  );
}
