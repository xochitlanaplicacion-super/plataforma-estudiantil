'use server';

import { z } from 'zod';
import { requireTenantSession } from '@/lib/tenant/context';

const assignmentSchema=z.object({id:z.string().uuid(),subjectName:z.string(),groupName:z.string(),levelName:z.string().optional(),gradeName:z.string().optional()});
const contextSchema=z.object({period:z.object({name:z.string()}),assignments:z.array(assignmentSchema)});
const summarySchema=z.object({date:z.string(),subjectName:z.string(),groupName:z.string(),students:z.array(z.object({enrollmentId:z.string().uuid(),name:z.string(),todayCount:z.number(),todayPoints:z.number(),periodCount:z.number(),periodPoints:z.number()}))});

export type TeacherParticipationData={
  periodName:string;
  assignments:z.infer<typeof assignmentSchema>[];
  selectedAssignmentId:string|null;
  summary:z.infer<typeof summarySchema>|null;
};

export async function loadTeacherParticipationAction(assignmentIdInput?:unknown):Promise<{ok:true;data:TeacherParticipationData}|{ok:false;message:string}>{
  try{
    const session=await requireTenantSession(['profesor']);
    const contextResult=await session.supabase.rpc('obtener_contexto_docente_movil');
    if(contextResult.error)throw contextResult.error;
    const context=contextSchema.parse(contextResult.data);
    const requested=typeof assignmentIdInput==='string'?z.string().uuid().safeParse(assignmentIdInput):null;
    const selectedId=requested?.success&&context.assignments.some(row=>row.id===requested.data)?requested.data:context.assignments[0]?.id??null;
    if(!selectedId)return{ok:true,data:{periodName:context.period.name,assignments:context.assignments,selectedAssignmentId:null,summary:null}};
    const summaryResult=await session.supabase.rpc('obtener_resumen_participacion_docente_movil',{p_asignacion_id:selectedId});
    if(summaryResult.error)throw summaryResult.error;
    return{ok:true,data:{periodName:context.period.name,assignments:context.assignments,selectedAssignmentId:selectedId,summary:summarySchema.parse(summaryResult.data)}};
  }catch(error){
    console.error('No se pudo cargar el resumen de participación del profesor.',error);
    return{ok:false,message:'No se pudo cargar la participación. Actualiza la página e inténtalo nuevamente.'};
  }
}
