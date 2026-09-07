import { AcademicReportsDashboard } from '@/components/academic/AcademicReportsDashboard';
import { loadAcademicReportAction } from '@/lib/actions/reportes-academicos';

export const dynamic='force-dynamic';

export default async function AcademicReportsPage(){
  const result=await loadAcademicReportAction();
  if(!result.ok)return <main className="mx-auto max-w-2xl rounded-2xl border bg-card p-6"><h1 className="text-2xl font-black">Reportes académicos</h1><p role="alert" className="mt-3 text-destructive">{result.message}</p></main>;
  return <AcademicReportsDashboard initialData={result.data}/>;
}
