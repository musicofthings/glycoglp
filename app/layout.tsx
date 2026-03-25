import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Molecular Viewer',
  description: 'Mol* powered protein/peptide viewer with sequence synchronization',
  icons: {
    icon: '/icon.svg'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
