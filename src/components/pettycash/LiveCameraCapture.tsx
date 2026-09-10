import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera as CameraIcon, Loader2 } from 'lucide-react';
import { loadOpenCV } from '../../utils/scanner/cvLoader';
import { canvasToMat } from '../../utils/scanner/imageIo';
import { detectDocument, DetectionConfidence } from '../../utils/scanner/documentDetector';
import { Quad } from '../../utils/scanner/geometry';

// Live in-app camera view for the Petty Cash Invoice Document Scanner
// (2026-09-10 direct request: "take photo should redirect to camera...
// under the camera if we place invoice then it auto detects the invoice
// and shows" - a real-time edge outline while framing the shot, like
// CamScanner/Adobe Scan, not just the phone's plain native camera app).
//
// This is deliberately a THIN layer on top of everything already built and
// verified this session: it only produces a full-resolution captured
// <canvas> and hands it back via onCapture - DocumentScanner.tsx then
// funnels that into the exact same handleFileSelected -> loadPhotoCanvases
// -> runBackgroundDetection path a gallery upload already takes (see its
// own handleCameraCapture). The live outline here is a framing aid only;
// the actual crop the employee ends up with always comes from that same
// full-resolution, already-fixed detectAndProcess pipeline, not from
// anything computed in this component.
//
// getUserMedia (live camera access) cannot be exercised in this session's
// own Node test harness the way the detection/enhancement fixes earlier
// this session were - it needs a real browser + a real camera + a secure
// context (HTTPS, or localhost). onUnavailable therefore MUST cover every
// way this can fail (no mediaDevices API at all, permission denied, no
// camera hardware, insecure origin) by falling back to the existing plain
// <input capture="environment"> flow - an employee can never be left
// without any way to take a photo just because live preview didn't work
// on their device/browser.

const LIVE_DETECT_MAX_DIM = 480; // small + fast - only for the live outline, never the final crop
const LIVE_DETECT_INTERVAL_MS = 450; // throttled - running OpenCV every single video frame would peg a phone's CPU

interface Props {
  onCapture: (canvas: HTMLCanvasElement) => void; // full-resolution captured frame, in the video's native pixel size
  onCancel: () => void;
  onUnavailable: () => void; // camera access failed/denied/unsupported - caller falls back to the native camera-app picker
}

export default function LiveCameraCapture({ onCapture, onCancel, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvRef = useRef<any>(null);
  const detectingRef = useRef(false); // never start a new live detection while the previous one is still running
  const stoppedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [confidence, setConfidence] = useState<DetectionConfidence>('low');
  const [statusMessage, setStatusMessage] = useState('Starting camera...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onUnavailable();
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false
        });
      } catch (err) {
        // Permission denied, no camera hardware, insecure origin, etc. -
        // never a dead end, just fall back to the native camera picker.
        console.error('Camera access failed, falling back to native camera:', err);
        if (!cancelled) onUnavailable();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // play() can reject if a newer call superseded it - harmless,
          // the <video autoPlay> attribute will still start it.
        }
      }
      setStatusMessage('Loading scanner engine (first time only)...');
      try {
        cvRef.current = await loadOpenCV();
      } catch (err) {
        // The live outline is a nice-to-have guide, not a requirement - if
        // the engine fails to load, the employee can still frame by eye
        // and tap Capture; detection then runs afterward on the captured
        // photo exactly like any other scan (same graceful degrade the
        // rest of this feature already relies on).
        console.error('Scanner engine failed to load for the live preview overlay:', err);
      }
      if (cancelled) return;
      setReady(true);
      setStatusMessage('');
    })();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live detection loop - throttled and self-skipping (a slow device just
  // updates the outline less often instead of queueing up overlapping
  // OpenCV work). Runs on a small downscaled copy of the current video
  // frame; the eventual Capture always re-detects at full resolution.
  useEffect(() => {
    if (!ready || !cvRef.current) return;
    const cv = cvRef.current;
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d');
    if (!detectCtx) return;

    const intervalId = window.setInterval(() => {
      if (stoppedRef.current || detectingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      detectingRef.current = true;
      try {
        const scale = Math.min(1, LIVE_DETECT_MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
        const dw = Math.max(1, Math.round(video.videoWidth * scale));
        const dh = Math.max(1, Math.round(video.videoHeight * scale));
        detectCanvas.width = dw;
        detectCanvas.height = dh;
        detectCtx.drawImage(video, 0, 0, dw, dh);

        const mat = canvasToMat(cv, detectCanvas);
        let result;
        try {
          result = detectDocument(cv, mat);
        } finally {
          mat.delete();
        }

        if (overlayRef.current) {
          overlayRef.current.width = dw;
          overlayRef.current.height = dh;
        }
        setQuad(result.quad);
        setConfidence(result.confidence);
      } catch (err) {
        // A single bad frame must never break the live loop - just skip it.
        console.error('Live frame detection failed:', err);
      } finally {
        detectingRef.current = false;
      }
    }, LIVE_DETECT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [ready]);

  // Draws the current quad onto the overlay canvas, in the same coordinate
  // space it was detected in (detectCanvas's own downscaled pixel size).
  // The overlay <canvas> is stretched via CSS to exactly match the <video>
  // element's displayed box (both w-full h-auto, same source aspect
  // ratio), so no further coordinate scaling is needed here.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!quad) return;
    const color = confidence === 'high' ? '#10b981' : confidence === 'medium' ? '#f59e0b' : '#94a3b8';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, canvas.width * 0.008);
    ctx.beginPath();
    quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    quad.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, canvas.width * 0.012), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }, [quad, confidence]);

  const stopStream = () => {
    stoppedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    stopStream();
    onCapture(canvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCapture]);

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  const statusLabel = !ready ? '' : quad ? (confidence === 'high' ? 'Invoice detected - tap to capture' : 'Hold steady...') : 'Point the camera at the invoice';

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="relative w-full max-w-md rounded-xl overflow-hidden bg-black shadow-inner">
        <video ref={videoRef} className="w-full h-auto block" autoPlay playsInline muted />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white text-xs">
            <Loader2 className="w-5 h-5 animate-spin" />
            {statusMessage}
          </div>
        )}
        {ready && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center px-3">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-black/60 text-white text-center">
              {statusLabel}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={handleCancel}
          className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <span className="w-10 h-10 rounded-full border border-slate-300 flex items-center justify-center">
            <X className="w-4 h-4" />
          </span>
          <span className="text-[10px] font-bold uppercase">Cancel</span>
        </button>

        <button
          type="button"
          onClick={handleCapture}
          disabled={!ready}
          className="w-16 h-16 rounded-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center shadow-lg transition-colors"
        >
          <CameraIcon className="w-7 h-7 text-white" />
        </button>

        <span className="w-10" /> {/* balances the Cancel button so the shutter stays visually centered */}
      </div>
    </div>
  );
}
