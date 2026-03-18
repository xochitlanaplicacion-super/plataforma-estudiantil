
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
  ClipboardList,
  BarChart3,
  UserCheck
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

  // Mapeo de los 10 Módulos del Plan de Desarrollo
  const menuItems = {
    superuser: [
      { group: "Módulo 1 & 2: Acceso y Usuarios", items: [
        { icon: LayoutDashboard, label: 'Dashboard General', href: '/dashboard/admin' },
        { icon: Users, label: 'Gestión de Usuarios', href: '/dashboard/admin/usuarios' },
      ]},
      { group: "Módulo 3: Estructura Académica", items: [
        { icon: School, label: 'Niveles y Carreras', href: '/dashboard/admin/estructura' },
        { icon: Layers, label: 'Grados y Grupos', href: '/dashboard/admin/grupos' },
        { icon: BookOpen, label: 'Materias y Unidades', href: '/dashboard/admin/materias' },
      ]},
      { group: "Módulo 4: Asignaciones", items: [
        { icon: GraduationCap, label: 'Asignación Docente', href: '/dashboard/admin/asignaciones' },
        { icon: CalendarCheck, label: 'Inscripción Alumnos', href: '/dashboard/admin/inscripciones' },
      ]},
      { group: "Módulo 5 & 6: Contenido", items: [
        { icon: FileText, label: 'Repositorio de Temas', href: '/dashboard/admin/contenido' },
        { icon: UserCheck, label: 'Autorización Grupal', href: '/dashboard/admin/autorizaciones' },
      ]},
      { group: "Módulo 10: Control y Reportes", items: [
        { icon: Clock, label: 'Control de Vigencia', href: '/dashboard/admin/vigencias' },
        { icon: BarChart3, label: 'Reportes y Auditoría', href: '/dashboard/admin/auditoria' },
      ]}
    ],
    admin: [
      { group: "Módulo Admin", items: [
        { icon: LayoutDashboard, label: 'Dashboard Local', href: '/dashboard/admin' },
        { icon: Users, label: 'Usuarios del Área', href: '/dashboard/admin/usuarios' },
      ]}
    ],
    profesor: [
      { group: "Módulo 8: Docencia", items: [
        { icon: LayoutDashboard, label: 'Mis Asignaturas', href: '/dashboard/profesor' },
        { icon: Layers, label: 'Unidades y Temas', href: '/dashboard/profesor/contenido' },
        { icon: ClipboardList, label: 'Seguimiento Académico', href: '/dashboard/profesor/seguimiento' },
      ]}
    ],
    alumno: [
      { group: "Módulo 9: Mi Estudio", items: [
        { icon: LayoutDashboard, label: 'Mi Portal Educativo', href: '/dashboard/alumno' },
        { icon: BookOpen, label: 'Mis Materias', href: '/dashboard/alumno/materias' },
      ]}
    ],
  };

  const activeMenus = menuItems[userRole] || [];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r shadow-lg">
        <SidebarHeader className="p-6 flex items-center gap-3">
          <div className="bg-primary h-10 w-10 rounded-xl flex items-center justify-center font-bold text-primary-foreground shadow-md">EF</div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-lg text-sidebar-foreground">EduFlow</span>
            <span className="text-[10px] text-muted-foreground font-semibold tracking-wider">PLATAFORMA EDUCATIVA</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          {activeMenus.map((group, idx) => (
            <SidebarGroup key={idx} className="mb-4">
              <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.15em] font-bold text-primary/60 px-4 mb-2">
                {group.group}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton 
                      asChild 
                      tooltip={item.label}
                      isActive={pathname === item.href}
                      className={pathname === item.href ? "bg-primary/10 text-primary font-bold" : "hover:bg-primary/5"}
                    >
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
        <SidebarFooter className="p-4 border-t bg-muted/30">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border group-data-[collapsible=icon]:hidden mb-4">
                <Avatar className="h-10 w-10 border-2 border-primary/10 shadow-sm">
                  <AvatarFallback className="bg-accent text-accent-foreground font-bold text-sm">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-bold truncate leading-none mb-1 text-gray-800">{userName}</span>
                  <span className="text-[10px] text-primary/70 uppercase font-black tracking-tighter">{userRole}</span>
                </div>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton 
                onClick={handleLogout}
                className="text-destructive hover:text-destructive hover:bg-destructive/5 transition-all font-semibold rounded-lg"
              >
                <LogOut className="h-5 w-5" />
                <span>Cerrar Sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-slate-50/50">
        <div className="h-full flex flex-col">
          <header className="h-16 border-b bg-white flex items-center px-8 justify-between shrink-0">
             <div className="flex items-center gap-2">
               <span className="text-sm text-muted-foreground">Ubicación:</span>
               <span className="text-sm font-semibold text-primary capitalize">{pathname.split('/').pop()?.replace('-', ' ')}</span>
             </div>
             <div className="flex items-center gap-4">
               <div className="h-8 w-px bg-border mx-2" />
               <span className="text-xs font-bold text-muted-foreground uppercase">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
             </div>
          </header>
          <main className="flex-1 overflow-auto p-6 md:p-10">
            <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-700">
              {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
