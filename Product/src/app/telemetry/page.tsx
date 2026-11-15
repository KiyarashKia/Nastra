import type { Metadata } from 'next';
import { TelemetryPage } from '@/ui/pages/TelemetryPage';
export default function Page() { return <TelemetryPage />; }
export const metadata: Metadata = { title: 'Telemetry' };
