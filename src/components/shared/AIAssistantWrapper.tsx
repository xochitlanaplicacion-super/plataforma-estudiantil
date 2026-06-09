'use client';

import { usePathname } from 'next/navigation';

export function AIAssistantWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Ocultar el globo de la IA en cualquier página de mensajería (clases o administración)
  // para que no obstruya el botón de enviar o la interfaz de los chats.
  if (pathname && pathname.includes('/mensajes')) {
    return null;
  }
  
  return <>{children}</>;
}
