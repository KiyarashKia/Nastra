import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@nastra/nhis/fonts.css';
import '@nastra/nhis/styles.css';
import './station.css';
import './spectre-skin.css';
import { StationShell } from '@/ui/StationShell';

export const metadata: Metadata = { title: { default: 'NASTRA Station', template: '%s · NASTRA Station' }, description: 'Astronaut health copilot. Simulation build.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StationShell>{children}</StationShell>
      </body>
    </html>
  );
}
