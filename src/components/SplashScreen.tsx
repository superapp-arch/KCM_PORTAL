import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import companyTruck from '../assets/images/kcm_vehicle_cutout.png';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-between text-white z-50 overflow-hidden font-sans py-8">
      {/* Empty spacer to align center */}
      <div />

      {/* Core Container */}
      <div className="relative flex flex-col items-center max-w-lg w-full px-6 text-center select-none z-10 overflow-hidden">
        <div className="w-full flex flex-col items-center">
          {/* Black-background Company Truck Image Card - drives in from the left */}
          <motion.div
            initial={{ x: '-130vw', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-80 h-48 bg-black rounded-2xl overflow-hidden border border-slate-900 shadow-2xl mb-6 group flex items-center justify-center"
          >
            <img
              src={companyTruck}
              alt="KCM Company Truck"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h1 className="text-3xl font-black tracking-tight uppercase">
              <span className="text-emerald-400">KCM </span>
              <span className="text-red-400">LOGISTICS</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono tracking-widest uppercase mt-1">
              Corporate Logistics Fleet
            </p>
          </motion.div>
        </div>

        {/* Loading Indicator */}
        <div className="mt-8 w-48 h-1 bg-slate-800 rounded-full overflow-hidden relative mx-auto">
          <motion.div
            initial={{ left: "-100%" }}
            animate={{ left: "100%" }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 rounded-full"
          />
        </div>
      </div>

      {/* Brand/Version footer */}
      <div className="w-full max-w-sm px-6 text-center select-none z-20">
        <div className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">
          SECURE LOGISTICS PORTAL • v3.2
        </div>
      </div>
    </div>
  );
}
