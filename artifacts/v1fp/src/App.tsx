import React from 'react';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Marquee } from './components/Marquee';
import { DemoPlanner } from './components/DemoPlanner';
import { WhatItDoes } from './components/WhatItDoes';
import { FounderStory } from './components/FounderStory';
import { Invite } from './components/Invite';
import { Footer } from './components/Footer';

export function App() {
  return (
    <div className="min-h-screen w-full bg-paper font-sans text-ink">
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <DemoPlanner />
        <WhatItDoes />
        <FounderStory />
        <Invite />
      </main>
      <Footer />
    </div>);

}