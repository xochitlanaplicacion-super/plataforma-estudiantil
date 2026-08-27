import { CalendarRange, CheckCircle2, CircleAlert, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AcademicContextIndicator } from '@/lib/academic-grading/cycle-context';

interface AcademicContextCardProps {
  context: AcademicContextIndicator | null;
  loading?: boolean;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function AcademicContextCard({ context, loading = false }: AcademicContextCardProps) {
  if (loading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Contexto académico</CardTitle>
          <CardDescription>Consultando ciclo, matrículas y asignaciones…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!context?.cycle) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <CircleAlert className="h-5 w-5 text-muted-foreground" /> Contexto académico
          </CardTitle>
          <CardDescription>No existe un ciclo escolar activo para esta institución.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <CalendarRange className="h-5 w-5 text-primary" /> Contexto académico vigente
          </CardTitle>
          <CardDescription>
            {context.cycle.name} · {formatDate(context.cycle.startsOn)}–{formatDate(context.cycle.endsOn)}
          </CardDescription>
        </div>
        <Badge variant={context.isCoherent ? 'default' : 'secondary'}>
          {context.isCoherent ? (
            <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Matrículas coherentes</>
          ) : (
            <><CircleAlert className="mr-1 h-3.5 w-3.5" /> Revisión requerida</>
          )}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Alumnos activos</p>
          <p className="text-2xl font-semibold text-foreground">{context.activeStudents}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Matrículas activas</p>
          <p className="text-2xl font-semibold text-foreground">{context.activeEnrollments}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <UsersRound className="h-3.5 w-3.5" /> Asignaciones docentes
          </p>
          <p className="text-2xl font-semibold text-foreground">{context.activeAssignments}</p>
        </div>
      </CardContent>
    </Card>
  );
}
