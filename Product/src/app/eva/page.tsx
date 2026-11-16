import type { Metadata } from 'next';
import { EvaVisor } from '@/ui/eva/EvaVisor';
import '@/ui/eva/eva.css';

export const metadata: Metadata = { title: 'NASTRA EVA' };

export default function EvaPage() { return <EvaVisor />; }
