import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'GlycoGLP — Glyco-Masking Drug Discovery',
  description:
    'Multi-agent in silico GLP-1 glyco-masking program with Mol* molecular viewer. ' +
    'Explore synthesis-ready GLP-1 analogs with reduced nausea via delayed receptor activation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
