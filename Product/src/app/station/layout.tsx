import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StationShell } from '@/ui/StationShell';

export const metadata: Metadata = { title: { default: 'NASTRA Station', template: '%s · NASTRA Station' } };

export default function StationLayout({ children }: { children: ReactNode }) {
  return <StationShell>{children}</StationShell>;
}
