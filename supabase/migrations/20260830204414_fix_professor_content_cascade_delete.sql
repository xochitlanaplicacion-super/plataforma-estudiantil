-- Restablece el borrado jerarquico del contenido del profesor despues de que
-- el sistema de calificaciones agrego vinculos trazables a cada ejercicio.
--
-- La integridad tenant se conserva mediante las claves compuestas
-- (id, tenant_id). Las guardas de periodos cerrados siguen activas: esta
-- migracion solo permite que una eliminacion autorizada propague a sus filas
-- dependientes en lugar de fallar siempre con SQLSTATE 23503.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.resultados_ejercicios
  drop constraint resultados_link_tenant_fkey,
  add constraint resultados_link_tenant_fkey
    foreign key (vinculo_evaluacion_id, tenant_id)
    references public.vinculos_evaluacion_ejercicio (id, tenant_id)
    on delete cascade,
  drop constraint resultados_unit_tenant_fkey,
  add constraint resultados_unit_tenant_fkey
    foreign key (unidad_origen_id, tenant_id)
    references public.unidades (id, tenant_id)
    on delete cascade;

alter table public.vinculos_evaluacion_ejercicio
  drop constraint vinculos_evaluacion_exercise_tenant_fkey,
  add constraint vinculos_evaluacion_exercise_tenant_fkey
    foreign key (ejercicio_id, tenant_id)
    references public.ejercicios (id, tenant_id)
    on delete cascade;

comment on constraint vinculos_evaluacion_exercise_tenant_fkey
  on public.vinculos_evaluacion_ejercicio is
  'El vinculo pertenece al ejercicio y se elimina con el contenido, sujeto a las guardas de cierre academico.';

comment on constraint resultados_link_tenant_fkey
  on public.resultados_ejercicios is
  'El resultado pertenece a su fuente de evaluacion y se elimina con ella, sujeto a las guardas de cierre academico.';

comment on constraint resultados_unit_tenant_fkey
  on public.resultados_ejercicios is
  'Permite borrar una unidad autorizada junto con toda su jerarquia de contenido y resultados.';
