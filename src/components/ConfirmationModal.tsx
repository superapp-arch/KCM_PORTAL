import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X as XIcon } from 'lucide-react';

// Shared, big, PhonePe/GPay-payment-screen-scale save/delete confirmation -
// replaces the old small below-button SaveConfirmationToast pattern
// (originally in FuelManagement.tsx) everywhere a module needs to confirm a
// save/update/commit or a delete. One component, reused by every module
// (Fuel Management, Petty Cash, Fleet Maintenance, Warehouse Details, Driver
// Details) instead of five separate implementations - each caller just
// passes its own `label` (e.g. "Entry", "Driver", "Warehouse log") and
// `identifier` (e.g. an indent no., a driver name) as props.
//
// Usage:
//   <SaveConfirmationModal open={!!saved} label="Entry" identifier="Indent no. 1245" onDone={() => setSaved(null)} />
//   <DeleteConfirmationModal open={!!deleted} label="Entry" identifier="Indent no. 1245" onDone={() => setDeleted(null)} />
//
// `headline`/`subtext` are optional overrides for the rare case the default
// "<label> saved" / "<identifier> committed successfully" phrasing (or the
// delete equivalent) doesn't read naturally for a given module.
interface ConfirmationModalProps {
  open: boolean;
  variant: 'save' | 'delete';
  label: string;
  identifier?: string;
  onDone: () => void;
  headline?: string;
  subtext?: string;
}

// Wide, colorful confetti burst (32 particles, big spread) radiating outward
// from the checkmark - only for the save variant, deletion isn't a
// celebratory event (see DeleteConfirmationModal below, which renders none).
function ConfettiBurst() {
  const pieces = useMemo(() => {
    const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#facc15', '#14b8a6', '#f97316', '#22d3ee'];
    return Array.from({ length: 32 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 32 + (Math.random() - 0.5) * 0.5;
      const distance = 90 + Math.random() * 110;
      return {
        id: i,
        color: colors[i % colors.length],
        shape: i % 3, // 0 circle, 1 square, 2 diamond
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        rotate: Math.random() * 360,
        size: 7 + Math.random() * 7,
        delay: Math.random() * 0.08
      };
    });
  }, []);

  return (
    <>
      {pieces.map(p => (
        <motion.span
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, scale: 0.5, rotate: p.rotate }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: p.delay }}
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{
            width: p.size, height: p.size, backgroundColor: p.color,
            borderRadius: p.shape === 0 ? '9999px' : p.shape === 1 ? '3px' : '2px',
            transform: p.shape === 2 ? 'rotate(45deg)' : undefined
          }}
        />
      ))}
    </>
  );
}

function ConfirmationModalInner({ open, variant, label, identifier, onDone, headline, subtext }: ConfirmationModalProps) {
  const isSave = variant === 'save';

  // Escape dismisses too, same as clicking Done or the dimmed backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDone]);

  const resolvedHeadline = headline || `${label} ${isSave ? 'saved' : 'deleted'}`;
  const resolvedSubtext = subtext || (identifier
    ? `${identifier} ${isSave ? 'committed successfully' : 'removed permanently'}`
    : (isSave ? 'Committed successfully.' : 'Removed permanently.'));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={onDone}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.92 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl px-8 py-10 flex flex-col items-center text-center"
          >
            {/* Icon + pulse ring + (save-only) confetti burst */}
            <div className="relative flex items-center justify-center mb-6" style={{ width: 92, height: 92 }}>
              {/* Expanding pulse ring behind the icon */}
              <motion.span
                initial={{ opacity: 0.5, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.9 }}
                transition={{ duration: 1.4, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.3 }}
                className={`absolute inset-0 rounded-full ${isSave ? 'bg-emerald-400' : 'bg-rose-400'}`}
              />
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={isSave
                  ? { scale: 1, opacity: 1 }
                  : { scale: [0.4, 1.08, 0.96, 1.04, 1], opacity: 1, x: [0, -6, 6, -4, 4, 0] }
                }
                transition={isSave
                  ? { type: 'spring', damping: 14, stiffness: 260, delay: 0.05 }
                  : { duration: 0.5, delay: 0.05 }
                }
                className={`relative z-10 rounded-full flex items-center justify-center shadow-lg ${isSave ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ width: 92, height: 92 }}
              >
                {isSave
                  ? <Check className="text-white" strokeWidth={3.5} style={{ width: 46, height: 46 }} />
                  : <XIcon className="text-white" strokeWidth={3.5} style={{ width: 46, height: 46 }} />
                }
              </motion.div>
              {isSave && <ConfettiBurst />}
            </div>

            <h2 className="text-xl font-black text-slate-900 mb-1.5">{resolvedHeadline}</h2>
            <p className="text-sm text-slate-500 font-medium mb-7">{resolvedSubtext}</p>

            <button
              type="button"
              onClick={onDone}
              className={`w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition-colors cursor-pointer ${
                isSave ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'
              }`}
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SaveConfirmationModal(props: Omit<ConfirmationModalProps, 'variant'>) {
  return <ConfirmationModalInner variant="save" {...props} />;
}

export function DeleteConfirmationModal(props: Omit<ConfirmationModalProps, 'variant'>) {
  return <ConfirmationModalInner variant="delete" {...props} />;
}
