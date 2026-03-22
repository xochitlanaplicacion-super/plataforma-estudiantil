
"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarProvider, 
  SidebarInset,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel
} from '@/components/ui/sidebar';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  GraduationCap, 
  LogOut, 
  Layers,
  FileText,
  Clock,
  School,
  CalendarCheck,
  UserCheck,
  BarChart3,
  ShieldAlert,
  MessageSquare,
  ClipboardList
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { UserRole } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
  userName: string;
}

export function DashboardLayout({ children, userRole, userName }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [theme, setTheme] = useState<string | null>(null);
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    const savedTheme = localStorage.getItem('ez-theme');
    if (savedTheme) setTheme(savedTheme);
    setFormattedDate(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const menuItems = {
    superuser: [
      { group: "CRM: Atención a Prospectos", items: [
        { icon: MessageSquare, label: 'Mensajes e Interesados', href: '/dashboard/admin/crm/mensajes' },
        { icon: ClipboardList, label: 'Pipeline Preregistros', href: '/dashboard/admin/crm/aspirantes' },
      ]},
      { group: "Módulo 1 & 2: Acceso y Usuarios", items: [
        { icon: LayoutDashboard, label: 'Dashboard General', href: '/dashboard/admin' },
        { icon: Users, label: 'Gestión de Usuarios', href: '/dashboard/admin/usuarios' },
      ]},
      { group: "Módulo 3: Estructura Académica", items: [
        { icon: School, label: 'Niveles y Carreras', href: '/dashboard/admin/estructura' },
        { icon: Layers, label: 'Grados y Grupos', href: '/dashboard/admin/grupos' },
        { icon: BookOpen, label: 'Materias y Unidades', href: '/dashboard/admin/materias' },
      ]},
      { group: "Módulo 10: Reportes", items: [
        { icon: Clock, label: 'Control de Vigencia', href: '/dashboard/admin/vigencias' },
        { icon: BarChart3, label: 'Reportes y Auditoría', href: '/dashboard/admin/auditoria' },
      ]}
    ],
    admin: [
      { group: "CRM y Atención", items: [
        { icon: MessageSquare, label: 'Mensajes Prospectos', href: '/dashboard/admin/crm/mensajes' },
        { icon: ClipboardList, label: 'Preregistros', href: '/dashboard/admin/crm/aspirantes' },
      ]},
      { group: "Administración Operativa", items: [
        { icon: LayoutDashboard, label: 'Dashboard Admin', href: '/dashboard/admin' },
        { icon: Users, label: 'Soporte Usuarios', href: '/dashboard/admin/usuarios' },
      ]}
    ],
    profesor: [
      { group: "Docencia", items: [
        { icon: LayoutDashboard, label: 'Mis Asignaturas', href: '/dashboard/profesor' },
        { icon: Layers, label: 'Unidades y Temas', href: '/dashboard/profesor/contenido' },
      ]}
    ],
    alumno: [
      { group: "Mi Portal", items: [
        { icon: LayoutDashboard, label: 'Mi Portal Educativo', href: '/dashboard/alumno' },
        { icon: BookOpen, label: 'Mis Materias', href: '/dashboard/alumno/materias' },
      ]}
    ],
  };

  const activeMenus = menuItems[userRole] || [];

  return (
    <SidebarProvider className={cn(theme === 'vino' && 'theme-vino', theme === 'verde' && 'theme-verde', theme === 'beige' && 'theme-beige')}>
      <Sidebar collapsible="icon" className="border-r shadow-lg">
        <SidebarHeader className="p-6 flex flex-col items-center text-center gap-4">
          <div className="h-36 w-36 flex-shrink-0 flex items-center justify-center">
            <img src="/images/logo_zapata.png" alt="Logo" className="h-full w-full object-contain drop-shadow-md" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-lg text-sidebar-foreground">Emiliano Zapata</span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Plataforma Académica</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          {activeMenus.map((group, idx) => (
            <SidebarGroup key={idx} className="mb-4">
              <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.15em] font-bold text-primary/60 px-4 mb-2">{group.group}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild tooltip={item.label} isActive={pathname === item.href} className={pathname === item.href ? "bg-primary/10 text-primary font-bold" : "hover:bg-primary/5"}>
                      <Link href={item.href} className="flex items-center gap-3 py-6">
                        <item.icon className={`h-5 w-5 ${pathname === item.href ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-4 bg-muted/30">
          <div className="flex justify-center group-data-[collapsible=icon]:hidden">
             <span className="text-[9px] text-muted-foreground font-bold uppercase opacity-50">EZ Plataforma v1.0</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-slate-50/50 overflow-hidden">
        <div className="h-full flex flex-col overflow-hidden">
          <header className="h-16 border-b bg-white flex items-center px-8 justify-between shrink-0 shadow-sm z-10 w-full">
             <div className="flex items-center gap-2">
               <span className="text-sm text-muted-foreground">Módulo:</span>
               <span className="text-sm font-semibold text-primary capitalize">{pathname.split('/').pop()?.replace('-', ' ') || 'Inicio'}</span>
             </div>
             <div className="flex items-center gap-6">
               <span className="text-xs font-bold text-muted-foreground uppercase hidden md:inline-block">{formattedDate}</span>
               <div className="flex items-center gap-4 bg-muted/30 p-1 rounded-full border border-border/50">
                <div className="flex items-center gap-2 pl-2">
                  <Avatar className="h-8 w-8 border-2 border-white shadow-sm shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground font-bold text-[10px]">{getInitials(userName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col pr-2">
                    <span className="text-[11px] font-bold text-gray-900 leading-tight truncate max-w-[150px]">{userName}</span>
                    <span className="text-[9px] text-primary/80 uppercase font-bold tracking-tight">{userRole}</span>
                  </div>
                </div>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"><LogOut className="h-4 w-4" /></Button>
              </div>
             </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10">
            <div className="max-w-full mx-auto animate-in fade-in slide-in-from-bottom-2 duration-700">{children}</div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
