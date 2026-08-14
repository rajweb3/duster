import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Duster — Zero-Knowledge AI Agent',
  description: 'A dedicated AI team member running on private infrastructure.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans">
        {children}
      </body>
    </html>
  );
}
