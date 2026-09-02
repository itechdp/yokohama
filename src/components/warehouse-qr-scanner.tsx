import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";
import type { WarehouseDef } from "@/data/warehouse-bins";

// Scans a QR code via the device camera and matches its text against a
// warehouse's `key`. Decoding runs client-side (jsQR against canvas frames)
// so it works the same in the browser and inside the Capacitor WebView.
export default function WarehouseQrScanner({
  warehouses,
  onMatch,
  onClose,
}: {
  warehouses: WarehouseDef[];
  onMatch: (key: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  // Phones vary widely in camera resolution and CPU headroom, so the decode
  // work is deliberately throttled and downscaled — decoding every frame at
  // full camera resolution would burn battery and can visibly lag on
  // low/mid-range Android devices. 80ms still leaves plenty of headroom
  // while feeling near-instant.
  const SCAN_INTERVAL_MS = 80;
  const MAX_DECODE_WIDTH = 640;

  // A short ascending two-note chime played whenever any QR code is decoded
  // (matched or not) — built with WebAudio instead of an audio file, so
  // there's nothing to bundle and it works offline the same in the browser
  // and the Capacitor WebView.
  const playScanChime = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [880, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
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
    // every ~80ms tick the same QR sits in frame. A single missed frame
    // (motion blur, autofocus hiccup) shouldn't count as "gone" — only clear
    // it after the code hasn't been seen for a bit, via a debounced timer.
    let lastCode: string | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

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
          if (code?.data) {
            scheduleReset();
            if (code.data !== lastCode) {
              lastCode = code.data;
              playScanChime();
              const match = warehouses.find((w) => w.key === code.data);
              if (match) {
                onMatch(match.key);
                return;
              }
              setNotFound(code.data);
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">Scan warehouse QR</h2>
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
            Scanned "{notFound}" — no warehouse matches that code.
          </p>
        )}
      </div>
    </div>
  );
}
