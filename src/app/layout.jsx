import { Manrope, Sora } from 'next/font/google';
import { TAGLINE } from '@/lib/client/constants';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const sora = Sora({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const metadata = {
  title: `RupeeFlow: ${TAGLINE}`,
  description: 'Minimalist ₹ budget & expense tracker with AI voice entry, receipt scanning, and insights',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'RupeeFlow' },
};

export const viewport = {
  themeColor: '#0e1116',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* restore saved theme before first paint (no flash) */}
        <script dangerouslySetInnerHTML={{
          __html: `try{var t=localStorage.getItem('rf_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
        }} />
      </head>
      <body className={`${manrope.variable} ${sora.variable}`}>{children}</body>
    </html>
  );
}
