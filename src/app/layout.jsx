import { Manrope, Sora } from 'next/font/google';
import { TAGLINE } from '@/lib/client/constants';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const sora = Sora({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

const description = 'AI-powered ₹ expense tracker: speak or scan an expense, get a real budget with pacing, and a weekly review that actually helps.';

export const metadata = {
  title: `RupeeFlow: ${TAGLINE}`,
  description,
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
  // So sharing the link (WhatsApp, etc.) shows a real preview card instead of a bare URL.
  openGraph: {
    title: `RupeeFlow: ${TAGLINE}`,
    description,
    siteName: 'RupeeFlow',
    images: [{ url: '/icon-512.png', width: 512, height: 512 }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: `RupeeFlow: ${TAGLINE}`,
    description,
    images: ['/icon-512.png'],
  },
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
