
"use client";

import React from 'react';
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
  Settings, 
  LogOut, 
  Layers,
  FileText,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserRole } from '@/lib/types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
  userName: string;
}

export function DashboardLayout({ children, userRole, userName }: DashboardLayoutProps) {
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  const menuItems = {
    superuser: [
      { icon: LayoutDashboard, label: 'Dashboard Global', href: '#' },
      { icon: Users, label: 'Gestión de Perfiles', href: '#' },
      { icon: GraduationCap, label: 'Niveles y Carreras', href: '#' },
      { icon: Clock, label: 'Vigencias (CURP)', href: '#' },
      { icon: ShieldCheck, label: 'Auditoría', href: '#' },
    ],
    admin: [
      { icon: LayoutDashboard, label: 'Panel Administrativo', href: '#' },
      { icon: Users, label: 'Alumnos y Matrículas', href: '#' },
      { icon: BookOpen, label: 'Materias y Grupos', href: '#' },
    ],
    profesor: [
      { icon: LayoutDashboard, label: 'Mis Asignaciones', href: '#' },
      { icon: BookOpen, label: 'Contenido Académico', href: '#' },
      { icon: Layers, label: 'Unidades y Temas', href: '#' },
    ],
    alumno: [
      { icon: LayoutDashboard, label: 'Mi Portal', href: '#' },
      { icon: BookOpen, label: 'Mis Materias', href: '#' },
      { icon: Clock, label: 'Mi Inscripción', href: '#' },
    ],
  };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="p-4 flex items-center gap-3">
          <div className="bg-accent h-8 w-8 rounded flex items-center justify-center font-bold text-accent-foreground">EF</div>
          <span className="font-bold text-lg text-sidebar-foreground group-data-[collapsible=icon]:hidden">EduFlow</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50">Menu Principal</SidebarGroupLabel>
            <SidebarMenu>
              {menuItems[userRole].map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton tooltip={item.label}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="w-full justify-start gap-3 h-auto p-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col text-left overflow-hidden group-data-[collapsible=icon]:hidden">
                  <span className="text-xs font-semibold truncate">{userName}</span>
                  <span className="text-[10px] opacity-70 uppercase">{userRole}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton className="text-destructive hover:text-destructive">
                <LogOut className="h-4 w-4" />
                <span>Cerrar Sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
        <main className="p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
