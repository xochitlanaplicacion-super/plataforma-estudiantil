import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza una fecha de la base de datos para evitar desfase de zona horaria.
 * Soporta ambos formatos:
 * - Viejo (UTC): "2026-05-11T05:59:59.000Z" → se interpreta correctamente en local
 * - Nuevo (local): "2026-05-10T23:59:59" → se interpreta directamente
 * - Solo fecha: "2026-05-10" → se interpreta como mediodía local para evitar -1 día
 */
export function parseFechaLocal(fecha: string | null | undefined): Date {
  if (!fecha) return new Date();
  // Si es solo fecha (sin T), agregar mediodía para evitar problemas UTC
  if (!fecha.includes('T')) {
    return new Date(fecha + 'T12:00:00');
  }
  return new Date(fecha);
}
