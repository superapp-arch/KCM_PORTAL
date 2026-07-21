interface WatermarkProps {
  src: string;
  opacity?: number;
  sizeClassName?: string;
}

// Faint, centered, non-interactive brand watermark meant to sit behind page
// content. Pass the logo asset in via `src` rather than importing it here so
// this component has no dependency on which logo file is currently in use.
export default function Watermark({ src, opacity = 0.05, sizeClassName = 'w-[70vw] max-w-2xl' }: WatermarkProps) {
  return (
    <div className="pointer-events-none select-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={`${sizeClassName} object-contain`}
        style={{ opacity }}
      />
    </div>
  );
}
