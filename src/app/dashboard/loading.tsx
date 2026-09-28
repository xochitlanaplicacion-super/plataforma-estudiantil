export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6" role="status" aria-live="polite">
      <p className="text-sm font-medium text-muted-foreground">Cargando sección…</p>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
