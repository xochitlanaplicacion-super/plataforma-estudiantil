
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ShieldCheck,
  School,
  CalendarCheck,
  ClipboardList
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserRole } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
  userName: string;
}

export function DashboardLayout({ children, userRole, userName }: DashboardLayoutProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const menuItems = {
    superuser: [
      { group: "Administración Global", items: [
        { icon: LayoutDashboard, label: 'Panel de Control', href: '/dashboard/admin' },
        { icon: Users, label: 'Gestión de Usuarios', href: '/dashboard/admin/usuarios' },
        { icon: School, label: 'Niveles y Carreras', href: '/dashboard/admin/estructura' },
      ]},
      { group: "Académico", items: [
        { icon: GraduationCap, label: 'Asignaciones Prof.', href: '/dashboard/admin/asignaciones' },
        { icon: CalendarCheck, label: 'Inscripciones Alum.', href: '/dashboard/admin/inscripciones' },
        { icon: BookOpen, label: 'Contenido Global', href: '/dashboard/admin/contenido' },
      ]},
      { group: "Seguridad", items: [
        { icon: Clock, label: 'Control de Vigencias', href: '/dashboard/admin/vigencias' },
        { icon: ShieldCheck, label: 'Auditoría de Sistema', href: '/dashboard/admin/auditoria' },
      ]}
    ],
    admin: [
      { group: "Gestión Local", items: [
        { icon: LayoutDashboard, label: 'Panel Admin', href: '/dashboard/admin' },
        { icon: Users, label: 'Alumnos y Matrículas', href: '/dashboard/admin/usuarios' },
        { icon: BookOpen, label: 'Materias y Grupos', href: '/dashboard/admin/estructura' },
      ]}
    ],
    profesor: [
      { group: "Docencia", items: [
        { icon: LayoutDashboard, label: 'Mis Asignaturas', href: '/dashboard/profesor' },
        { icon: Layers, label: 'Unidades y Temas', href: '/dashboard/profesor/contenido' },
        { icon: FileText, label: 'Recursos Didácticos', href: '/dashboard/profesor/recursos' },
        { icon: ClipboardList, label: 'Seguimiento Alumnos', href: '/dashboard/profesor/seguimiento' },
      ]}
    ],
    alumno: [
      { group: "Mi Estudio", items: [
        { icon: LayoutDashboard, label: 'Mi Portal', href: '/dashboard/alumno' },
        { icon: BookOpen, label: 'Mis Materias', href: '/dashboard/alumno/materias' },
        { icon: Clock, label: 'Mi Inscripción', href: '/dashboard/alumno/perfil' },
      ]}
    ],
  };

  const activeMenus = menuItems[userRole] || [];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="p-4 flex items-center gap-3">
          <div className="bg-primary h-8 w-8 rounded-lg flex items-center justify-center font-bold text-primary-foreground shadow-sm">EF</div>
          <span className="font-bold text-lg text-sidebar-foreground group-data-[collapsible=icon]:hidden">EduFlow</span>
        </SidebarHeader>
        <SidebarContent>
          {activeMenus.map((group, idx) => (
            <SidebarGroup key={idx}>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider font-bold opacity-50 px-4 mb-2">
                {group.group}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton 
                      asChild 
                      tooltip={item.label}
                      isActive={pathname === item.href}
                      className={pathname === item.href ? "bg-primary/10 text-primary font-semibold" : ""}
                    >
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className={`h-4 w-4 ${pathname === item.href ? "text-primary" : ""}`} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-4 border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-3 p-2 group-data-[collapsible=icon]:hidden">
                <Avatar className="h-9 w-9 border-2 border-primary/20">
                  <AvatarFallback className="bg-accent text-accent-foreground font-bold text-xs">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-bold truncate leading-none mb-1">{userName}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">{userRole}</span>
                </div>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton 
                onClick={handleLogout}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Cerrar Sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background/50">
        <main className="p-4 md:p-8 animate-in fade-in duration-500">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
