import type {Metadata} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/shared/ThemeProvider';

import { getInstitucionConfig } from '@/lib/actions/institucion';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getInstitucionConfig();
  
  return {
    title: `${config.nombre_corto || 'Plataforma'} | Sistema Académico`,
    description: `Plataforma educativa de ${config.nombre_completo || 'la institución'}.`,
    icons: {
      icon: config.favicon_url || '/icon.png',
      apple: config.favicon_url || '/icon.png',
    }
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Nunito:wght@400;600;700;800;900&family=Poppins:wght@400;600;700;800;900&family=Patrick+Hand&family=Caveat:wght@400;600;700&family=Comfortaa:wght@400;600;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />

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
