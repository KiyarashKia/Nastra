import type { Metadata } from 'next';
import { OverviewPage } from '@/ui/pages/OverviewPage';
export default function Page() { return <OverviewPage />; }
export const metadata: Metadata = { title: 'Overview' };
