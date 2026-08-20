-- Índices en el mismo orden de las llaves foráneas compuestas.
create index if not exists encuestas_creador_tenant_idx
  on public.encuestas (creador_id, tenant_id);
create index if not exists encuestas_grupo_tenant_idx
  on public.encuestas (grupo_id, tenant_id);

create index if not exists encuesta_opciones_encuesta_tenant_idx
  on public.encuesta_opciones (encuesta_id, tenant_id);

create index if not exists encuesta_votos_encuesta_tenant_idx
  on public.encuesta_votos (encuesta_id, tenant_id);
create index if not exists encuesta_votos_opcion_encuesta_tenant_idx
  on public.encuesta_votos (opcion_id, encuesta_id, tenant_id);
create index if not exists encuesta_votos_votante_tenant_idx
  on public.encuesta_votos (votante_id, tenant_id);
