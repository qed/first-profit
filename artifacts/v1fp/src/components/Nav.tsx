import React, { useState } from 'react';
import { MenuIcon, XIcon } from 'lucide-react';
import { Logo } from './Logo';

const LINKS = [
{ label: 'Try the demo', href: '#demo' },
{ label: "What it does", href: '#what' },
{ label: 'The kid who made it', href: '#founder' }];


export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-rule/70 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5 rounded-md" aria-label="AZEAP home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {LINKS.map((link) =>
          <a
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-subtle transition-colors hover:text-ink">
            
              {link.label}
            </a>
          )}
          <a
            href="#invite"
            className="rounded-md border border-ink bg-ink px-4 py-2 text-sm font-semibold text-paper transition-transform hover:-translate-y-0.5">
            
            Get an invite
          </a>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-rule p-2 text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}>
          
          {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open &&
      <nav
        id="mobile-nav"
        aria-label="Main"
        className="border-t border-rule/70 bg-paper px-5 pb-4 pt-2 md:hidden">
        
          <ul className="flex flex-col">
            {LINKS.map((link) =>
          <li key={link.href}>
                <a
              href={link.href}
              onClick={() => setOpen(false)}
              className="block border-b border-dashed border-rule py-3 text-sm font-medium text-ink">
              
                  {link.label}
                </a>
              </li>
          )}
          </ul>
          <a
          href="#invite"
          onClick={() => setOpen(false)}
          className="mt-4 block rounded-md bg-ink px-4 py-2.5 text-center text-sm font-semibold text-paper">
          
            Get an invite
          </a>
        </nav>
      }
    </header>);

}