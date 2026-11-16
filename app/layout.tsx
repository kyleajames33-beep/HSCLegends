import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
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
  themeColor: '#0b1020',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Account pages construct a browser client during server rendering. In an
  // unconfigured preview, leave them behind the proxy's unavailable response
  // instead of prerendering them with invented backend credentials.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    await connection();
  }
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
