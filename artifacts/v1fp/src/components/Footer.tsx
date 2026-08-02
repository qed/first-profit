import React from 'react';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="w-full border-t border-rule bg-paper px-5 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            The Almost Zero Effort Activity Planner. Made by a 9-year-old, supervised by his mum,
            used by ten families.
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 text-sm sm:gap-14">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              The product
            </h2>
            <ul className="mt-3 space-y-2 text-subtle">
              <li>
                <a href="#demo" className="hover:text-ink">
                  Try the demo
                </a>
              </li>
              <li>
                <a href="#what" className="hover:text-ink">
                  What it does
                </a>
              </li>
              <li>
                <a href="#invite" className="hover:text-ink">
                  Get an invite
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              The small print
            </h2>
            <ul className="mt-3 space-y-2 text-subtle">
              <li>
                <a href="#founder" className="hover:text-ink">
                  About Milo
                </a>
              </li>
              <li>
                <a href="#invite" className="hover:text-ink">
                  Privacy (mum wrote it)
                </a>
              </li>
              <li>
                <a href="#invite" className="hover:text-ink">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="mx-auto mt-9 flex w-full max-w-6xl flex-col gap-2 border-t border-dashed border-rule pt-5 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} AZEAP. All rights reserved, probably.</p>
        <p className="font-hand text-base text-tomato/90">
          go outside with your kids, that is the whole point
        </p>
      </div>
    </footer>);

}