import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Converts an ArrayBuffer to base64 in chunks — spreading a large
// Uint8Array straight into String.fromCharCode(...) can overflow the call
// stack for anything but small files, which an .xlsx easily exceeds.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Saves a generated file (e.g. an .xlsx export) so the user can get it onto
// their device. A plain browser's <a download> blob trick silently no-ops
// inside the bare Android WebView this app's APK runs in — there's no
// DownloadListener wired up to catch it — so on native platforms this
// writes the file via the Filesystem plugin and hands it to the native
// Share sheet instead (the standard Capacitor pattern for this). On the
// web it falls back to the normal blob-URL download, unchanged.
export async function saveGeneratedFile(buffer: ArrayBuffer, filename: string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = arrayBufferToBase64(buffer);
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ title: filename, url: written.uri });
    return;
  }

  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
