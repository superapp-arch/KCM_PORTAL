import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface AnimatedLorryProps {
  delay?: number;
  onStopped?: () => void;
}

export default function AnimatedLorry({ delay = 0, onStopped }: AnimatedLorryProps) {
  const [isStopped, setIsStopped] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStopped(true);
      if (onStopped) {
        onStopped();
      }
    }, 1500 + (delay * 1000));
    return () => clearTimeout(timer);
  }, [delay, onStopped]);

  // Wheel animation configuration
  const wheelAnimate = isStopped 
    ? { rotate: 0 } 
    : { rotate: 360 };

  const wheelTransition = isStopped
    ? { duration: 0.8, ease: 'easeOut' as const }
    : { repeat: Infinity, duration: 0.4, ease: 'linear' as const };

  return (
    <div className="flex flex-col items-center justify-center py-4 select-none relative overflow-visible">
      {/* Dynamic Road Bed Shadow */}
      <motion.div
        initial={{ scaleX: 0.1, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.15 }}
        transition={{ delay, duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-4 w-72 h-3.5 bg-black rounded-full filter blur-md"
      />

      {/* Main Truck Moving Assembly */}
      <motion.div
        initial={{ x: -400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{
          delay,
          duration: 1.5,
          ease: [0.16, 1, 0.3, 1] // Custom premium ease-out bezier curve
        }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* Subtle bounce/compression upon stopping */}
        <motion.div
          animate={isStopped ? {
            y: [0, -4, 2, -1, 0],
            rotate: [0, -0.5, 0.3, -0.1, 0]
          } : { y: [0, -1, 0] }}
          transition={isStopped ? {
            duration: 0.6,
            ease: "easeOut"
          } : {
            repeat: Infinity,
            duration: 0.25,
            ease: "easeInOut"
          }}
          className="relative"
        >
          {/* Main Truck SVG Illustration */}
          <svg
            viewBox="0 0 320 120"
            className="w-72 h-28 md:w-80 md:h-32 drop-shadow-2xl overflow-visible"
          >
            {/* Rear Under-carriage Bars */}
            <rect x="35" y="94" width="230" height="4" fill="#334155" rx="1" />
            <rect x="40" y="85" width="220" height="10" fill="#1e293b" />

            {/* Rear Mudguards */}
            <path d="M62,88 A16,16 0 0,0 98,88" stroke="#0f172a" strokeWidth="3.5" fill="none" />
            <path d="M112,88 A16,16 0 0,0 148,88" stroke="#0f172a" strokeWidth="3.5" fill="none" />
            <path d="M232,88 A16,16 0 0,0 268,88" stroke="#0f172a" strokeWidth="3.5" fill="none" />

            {/* Cabin Air Deflector Dome (Vibrant Green) */}
            <path d="M225,48 C240,48 262,54 266,66 L225,66 Z" fill="#10b981" />
            
            {/* Truck Cabin Base (Vibrant Green) */}
            <path d="M222,64 L268,64 C275,64 278,68 278,74 L278,92 C278,96 275,98 270,98 L222,98 Z" fill="#059669" />
            
            {/* Windshield Glass */}
            <path d="M245,67 L266,67 L260,78 L245,78 Z" fill="#93c5fd" opacity="0.9" />
            <rect x="250" y="70" width="12" height="2" fill="#ffffff" opacity="0.6" rx="0.5" />

            {/* Side Window */}
            <path d="M227,67 L240,67 L240,78 L227,78 Z" fill="#1e293b" opacity="0.8" />

            {/* Front Chrome Bumper Grill */}
            <rect x="274" y="86" width="6" height="8" fill="#cbd5e1" rx="1" />
            <circle cx="272" cy="90" r="1.5" fill="#fef08a" className="animate-pulse" /> {/* Headlight */}
            
            {/* Side Trim Accent Stripes (Red & Green) */}
            <rect x="222" y="82" width="54" height="2.5" fill="#ef4444" />
            <rect x="222" y="84.5" width="54" height="1.5" fill="#10b981" />

            {/* Cargo Container (Vibrant Red) */}
            <rect x="30" y="32" width="188" height="66" rx="5" fill="#ef4444" />
            
            {/* Premium Container Text Backdrop Diagonal Ribbon (Vibrant Green Accent) */}
            <path d="M30,32 L150,32 L90,98 L30,98 Z" fill="#10b981" opacity="0.9" />
            <path d="M125,32 L155,32 L115,98 L85,98 Z" fill="#ffffff" opacity="0.15" />

            {/* Container Door Locking Bars */}
            <line x1="34" y1="32" x2="34" y2="98" stroke="#b91c1c" strokeWidth="1.5" />
            <line x1="36" y1="32" x2="36" y2="98" stroke="#ef4444" strokeWidth="1" />
            
            {/* Container Structural Ribs/Grooves */}
            <line x1="65" y1="32" x2="65" y2="98" stroke="#991b1b" strokeWidth="2.5" opacity="0.4" />
            <line x1="100" y1="32" x2="100" y2="98" stroke="#991b1b" strokeWidth="2.5" opacity="0.4" />
            <line x1="135" y1="32" x2="135" y2="98" stroke="#991b1b" strokeWidth="2.5" opacity="0.4" />
            <line x1="170" y1="32" x2="170" y2="98" stroke="#991b1b" strokeWidth="2.5" opacity="0.4" />
            <line x1="200" y1="32" x2="200" y2="98" stroke="#991b1b" strokeWidth="2.5" opacity="0.4" />

            {/* Container High-Gloss Top Glare */}
            <path d="M32,34 L216,34 L212,42 L36,42 Z" fill="#ffffff" opacity="0.1" />

            {/* BRANDING: "KCM LOGISTICS" in mixed bold colours on Container Side */}
            <g transform="translate(132, 64)">
              {/* White outer outline glow for extreme legibility */}
              <text
                x="0"
                y="-4"
                textAnchor="middle"
                className="font-sans font-black tracking-wider text-[22px] italic uppercase"
                fill="#ffffff"
                stroke="#ffffff"
                strokeWidth="2"
              >
                KCM
              </text>
              <text
                x="0"
                y="-4"
                textAnchor="middle"
                className="font-sans font-black tracking-wider text-[22px] italic uppercase"
                fill="#10b981" // Green KCM text on the red/green split
              >
                KCM
              </text>

              <text
                x="0"
                y="14"
                textAnchor="middle"
                className="font-sans font-extrabold tracking-widest text-[9px] uppercase"
                fill="#ffffff"
                stroke="#b91c1c"
                strokeWidth="1.5"
              >
                LOGISTICS
              </text>
              <text
                x="0"
                y="14"
                textAnchor="middle"
                className="font-sans font-extrabold tracking-widest text-[9px] uppercase"
                fill="#fef08a" // Bright Yellow/Gold for superb highlight contrast
              >
                LOGISTICS
              </text>
            </g>

            {/* Rear Wheel Dual 1 */}
            <motion.g
              transform="translate(80, 96)"
              animate={wheelAnimate}
              transition={wheelTransition}
            >
              <circle cx="0" cy="0" r="16" fill="#0f172a" />
              <circle cx="0" cy="0" r="11" fill="#475569" stroke="#1e293b" strokeWidth="1" />
              <circle cx="0" cy="0" r="5" fill="#cbd5e1" />
              {/* Wheel Spoke Dots */}
              <line x1="-8" y1="0" x2="8" y2="0" stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="0" y1="-8" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="1.5" />
            </motion.g>

            {/* Rear Wheel Dual 2 */}
            <motion.g
              transform="translate(130, 96)"
              animate={wheelAnimate}
              transition={wheelTransition}
            >
              <circle cx="0" cy="0" r="16" fill="#0f172a" />
              <circle cx="0" cy="0" r="11" fill="#475569" stroke="#1e293b" strokeWidth="1" />
              <circle cx="0" cy="0" r="5" fill="#cbd5e1" />
              {/* Wheel Spoke Dots */}
              <line x1="-8" y1="0" x2="8" y2="0" stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="0" y1="-8" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="1.5" />
            </motion.g>

            {/* Cabin Front Wheel */}
            <motion.g
              transform="translate(250, 96)"
              animate={wheelAnimate}
              transition={wheelTransition}
            >
              <circle cx="0" cy="0" r="16" fill="#0f172a" />
              <circle cx="0" cy="0" r="11" fill="#475569" stroke="#1e293b" strokeWidth="1" />
              <circle cx="0" cy="0" r="5" fill="#cbd5e1" />
              {/* Wheel Spoke Dots */}
              <line x1="-8" y1="0" x2="8" y2="0" stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="0" y1="-8" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="1.5" />
            </motion.g>
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
