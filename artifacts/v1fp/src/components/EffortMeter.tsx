import React from 'react';
import { motion } from 'framer-motion';

type EffortMeterProps = {
  value: number;
  label: string;
};

export function EffortMeter({ value, label }: EffortMeterProps) {
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
          Parent effort
        </span>
        <span className="font-display text-sm font-semibold text-ink">{label}</span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-rule/60"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Parent effort: ${label}`}>
        
        <motion.div
          className={value > 50 ? 'h-full rounded-full bg-tomato' : 'h-full rounded-full bg-mint'}
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
        
      </div>
    </div>);

}