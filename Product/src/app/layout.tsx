import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@nastra/nhis/fonts.css';
import '@nastra/nhis/styles.css';
import './station.css';
import './spectre-skin.css';

export const metadata: Metadata = {
  title: { default: 'NASTRA', template: '%s · NASTRA' },
  description: 'Astronaut Intelligent Health Copilot. Simulation build.',
};

/** Root: shared tokens and fonts only. Each mode (Station, EVA) brings its own shell. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
