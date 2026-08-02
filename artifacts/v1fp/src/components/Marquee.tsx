import React from 'react';

const ITEMS = [
'Currently onboarding family #7 of 10',
'Built after homework',
'Mum handles the legal bits',
'One real family at a time',
'4 fewer group chats',
'The shin guards are in the car'];


export function Marquee() {
  return (
    <div className="w-full border-y border-rule bg-ink py-2.5" aria-hidden="true">
      <div className="flex overflow-hidden">
        <div className="flex shrink-0 animate-[marquee_38s_linear_infinite] items-center gap-8 pr-8">
          {[...ITEMS, ...ITEMS].map((item, i) =>
          <span
            key={`${item}-${i}`}
            className="flex shrink-0 items-center gap-8 whitespace-nowrap text-xs font-medium uppercase tracking-[0.16em] text-paper/70">
            
              {item}
              <span className="h-1 w-1 rounded-full bg-marker" />
            </span>
          )}
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>);

}