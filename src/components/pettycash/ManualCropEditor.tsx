import React, { useMemo, useRef, useState } from 'react';
import { Point, Quad, isValidDocumentQuad, orderCorners } from '../../utils/scanner/geometry';

// Manual four-corner crop fallback (2026-09-08 Petty Cash Invoice Document
// Scanner direct request, spec section 20) - mandatory whenever automatic
// detection is missing or low-confidence. Four draggable handles over the
// full-resolution original image; corners are always kept in TL/TR/BR/BL
// order (re-sorted after every drag) so a crossed drag can't silently
// produce a self-intersecting/invalid quad - Apply Crop stays disabled
// until the current point set passes the same isValidDocumentQuad check
// the automatic detector itself uses.
interface Props {
  imageWidth: number;
  imageHeight: number;
  imageSrc: string; // data URL of the full-resolution original
  initialQuad: Quad;
  onApply: (quad: Quad) => void;
  onCancel: () => void;
}

const DISPLAY_MAX_WIDTH = 560;
const HANDLE_R = 10;

export default function ManualCropEditor({ imageWidth, imageHeight, imageSrc, initialQuad, onApply, onCancel }: Props) {
  const [points, setPoints] = useState<Point[]>(initialQuad);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);

  const scale = useMemo(() => Math.min(1, DISPLAY_MAX_WIDTH / imageWidth), [imageWidth]);
  const displayWidth = Math.round(imageWidth * scale);
  const displayHeight = Math.round(imageHeight * scale);

  const orderedQuad = useMemo(() => orderCorners(points), [points]);
  const isValid = useMemo(() => isValidDocumentQuad(orderedQuad, imageWidth, imageHeight), [orderedQuad, imageWidth, imageHeight]);

  const toImageCoords = (clientX: number, clientY: number): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(displayWidth, clientX - rect.left)) / scale;
    const y = Math.max(0, Math.min(displayHeight, clientY - rect.top)) / scale;
    return { x, y };
  };

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingIndex.current = index;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIndex.current === null) return;
    const next = [...points];
    next[draggingIndex.current] = toImageCoords(e.clientX, e.clientY);
    setPoints(next);
  };

  const handlePointerUp = () => {
    draggingIndex.current = null;
  };

  const polygonPoints = points.map(p => `${p.x * scale},${p.y * scale}`).join(' ');

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Drag the four corners so they line up with the edges of the receipt/invoice, then tap <span className="font-semibold">Apply Crop</span>.
      </p>
      <div
        ref={containerRef}
        className="relative select-none touch-none mx-auto"
        style={{ width: displayWidth, height: displayHeight }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={imageSrc}
          alt="Select document corners"
          className="absolute inset-0 w-full h-full object-contain rounded-lg border border-slate-200 pointer-events-none"
          draggable={false}
          width={displayWidth}
          height={displayHeight}
        />
        <svg className="absolute inset-0 pointer-events-none" width={displayWidth} height={displayHeight}>
          <polygon
            points={polygonPoints}
            fill="rgba(20,184,166,0.18)"
            stroke={isValid ? '#0d9488' : '#e11d48'}
            strokeWidth={2}
          />
        </svg>
        {points.map((p, i) => (
          <div
            key={i}
            onPointerDown={handlePointerDown(i)}
            className="absolute rounded-full bg-white border-2 border-teal-600 shadow-md cursor-grab active:cursor-grabbing touch-none"
            style={{
              width: HANDLE_R * 2,
              height: HANDLE_R * 2,
              left: p.x * scale - HANDLE_R,
              top: p.y * scale - HANDLE_R
            }}
          />
        ))}
      </div>

      {!isValid && (
        <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-center">
          This selection isn't a usable rectangle yet - adjust the corners so they form a simple, roughly rectangular shape around the document.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-xs font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(orderedQuad)}
          disabled={!isValid}
          className="px-4 py-2 rounded-lg text-xs font-bold uppercase bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer"
        >
          Apply Crop
        </button>
      </div>
    </div>
  );
}
