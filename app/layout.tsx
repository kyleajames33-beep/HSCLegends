import type { Metadata, Viewport } from 'next';
import { Outfit, DM_Sans } from 'next/font/google';
import './globals.css';
import SWRegister from '@/components/sw-register';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dmsans' });

export const metadata: Metadata = {
  title: 'HSC Legends',
  description: 'The phone-first HSC arena. Quick games, duels, weekly bosses.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Legends' },
};

export const viewport: Viewport = {
  themeColor: '#f9efe1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="app-shell">
          {children}
          <SWRegister />
        </div>
      </body>
    </html>
  );
}
