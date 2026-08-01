import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { FirebaseClientProvider } from '@/firebase';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/shared/ThemeProvider';

import { getInstitucionConfig } from '@/lib/actions/institucion';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getInstitucionConfig();
  const faviconUrl = config.favicon_url || config.logo_url || '/favicon.ico';
  
  return {
    title: `${config.nombre_corto || 'Plataforma'} | Sistema Académico`,
    description: `Plataforma educativa de ${config.nombre_completo || 'la institución'}.`,
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: faviconUrl },
      ],
      shortcut: [faviconUrl],
      apple: [faviconUrl],
    }
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getInstitucionConfig();
  const faviconUrl = config.favicon_url || config.logo_url || '/favicon.ico';

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Nunito:wght@400;600;700;800;900&family=Poppins:wght@400;600;700;800;900&family=Patrick+Hand&family=Caveat:wght@400;600;700&family=Comfortaa:wght@400;600;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
        <link rel="icon" href={faviconUrl} key="dynamic-favicon" />
        <link rel="shortcut icon" href={faviconUrl} key="dynamic-shortcut" />
        <link rel="apple-touch-icon" href={faviconUrl} key="dynamic-apple" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
