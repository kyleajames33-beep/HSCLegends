import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HSC Legends',
    short_name: 'Legends',
    description: 'The phone-first HSC arena. Quick games, duels, weekly bosses.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#4f46e5',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
