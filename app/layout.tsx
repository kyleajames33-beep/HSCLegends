import type { Metadata, Viewport } from 'next';
import './globals.css';
import SWRegister from '@/components/sw-register';

export const metadata: Metadata = {
  title: 'HSC Legends',
  description: 'The phone-first HSC arena. Quick games, duels, weekly bosses.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Legends' },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-50 flex flex-col">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
