-- Simplifica las capturas del encargado de filtro sin destruir columnas ni
-- expedientes históricos. Los campos que dejaron de solicitarse admiten NULL.
alter table public.filter_extraordinary_handoffs
  alter column identification_reference drop not null,
  alter column authorization_statement drop not null,
  alter column witness_name drop not null;

alter table public.filter_early_departures
  drop constraint if exists filter_early_departures_notified_party_check;

alter table public.filter_early_departures
  add constraint filter_early_departures_notified_party_check
  check (notified_party in ('madre', 'padre', 'tutor', 'familiar_autorizado'));

-- Padrón autorizado del archivo "mn j k.pdf". El proceso es idempotente: si
-- una persona ya existe en el mismo grupo, conserva su id y vuelve a activarla.
insert into public.filter_levels (tenant_id, name, sort_order, created_by)
select tenant.id, source.name, source.sort_order, tenant.initial_superuser_id
from public.tenants as tenant
cross join (values ('Maternal', 0), ('Preescolar', 1)) as source(name, sort_order)
where tenant.slug = 'xochitlan'
on conflict (tenant_id, name) do update set sort_order = excluded.sort_order;

with source(level_name, grade_name, group_name, sort_order) as (
  values
    ('Maternal', 'Maternal', 'A', 0),
    ('Preescolar', 'Primero', 'A', 1),
    ('Preescolar', 'Segundo', 'A', 2),
    ('Preescolar', 'Tercero', 'A', 3)
)
insert into public.filter_groups (
  tenant_id, level_id, grade_name, group_name, sort_order, created_by
)
select tenant.id, level.id, source.grade_name, source.group_name,
       source.sort_order, tenant.initial_superuser_id
from public.tenants as tenant
join source on true
join public.filter_levels as level
  on level.tenant_id = tenant.id and level.name = source.level_name
where tenant.slug = 'xochitlan'
on conflict (tenant_id, level_id, grade_name, group_name)
do update set sort_order = excluded.sort_order;

with roster(level_name, grade_name, group_name, full_name) as (
  values
    ('Preescolar', 'Segundo', 'A', 'Abarca Ojeda Jafet'),
    ('Preescolar', 'Segundo', 'A', 'Aroche Pedraza Samuel'),
    ('Preescolar', 'Segundo', 'A', 'Aroche Pedraza Santiago'),
    ('Preescolar', 'Segundo', 'A', 'Aroche Pedraza Sebastian'),
    ('Preescolar', 'Segundo', 'A', 'Flores Toledano Cesar Emiliano'),
    ('Preescolar', 'Segundo', 'A', 'Guillermo Medina Leah Saori'),
    ('Preescolar', 'Segundo', 'A', 'Guzmán Cortez Angel Eliel'),
    ('Preescolar', 'Segundo', 'A', 'Lagunas Figueroa Leandro'),
    ('Preescolar', 'Segundo', 'A', 'Liera Galicia Edson Zaid'),
    ('Preescolar', 'Segundo', 'A', 'Mancilla López Mariano'),
    ('Preescolar', 'Segundo', 'A', 'Miranda Ortega Lia Kailani'),
    ('Preescolar', 'Segundo', 'A', 'Ortiz Enduño Sophie Myriam'),
    ('Preescolar', 'Segundo', 'A', 'Reyes Delgado Angel Matias'),
    ('Preescolar', 'Segundo', 'A', 'Romero Najera Romina Guadalupe'),
    ('Preescolar', 'Segundo', 'A', 'Sandoval Carranza Gael'),
    ('Preescolar', 'Segundo', 'A', 'Valdepeña Gonzalez Atenea'),

    ('Preescolar', 'Tercero', 'A', 'Almazán Vázquez Valentina'),
    ('Preescolar', 'Tercero', 'A', 'Bahena Sánchez Liam Alejandro'),
    ('Preescolar', 'Tercero', 'A', 'Barrera Ortíz Marieth'),
    ('Preescolar', 'Tercero', 'A', 'Barrera Guizar Mia Alessandra'),
    ('Preescolar', 'Tercero', 'A', 'Caltenco Merino Raúl Emiliano'),
    ('Preescolar', 'Tercero', 'A', 'Carrasco Moya Juan Carlos'),
    ('Preescolar', 'Tercero', 'A', 'Castañeda Guzmán Lia Victoria'),
    ('Preescolar', 'Tercero', 'A', 'Castro Aparicio Zitzin Ameyali'),
    ('Preescolar', 'Tercero', 'A', 'García Suárez Miranda'),
    ('Preescolar', 'Tercero', 'A', 'Gutierrez Dominguez Axel Matias'),
    ('Preescolar', 'Tercero', 'A', 'Jiménez Liera Masha Sophia'),
    ('Preescolar', 'Tercero', 'A', 'López Nava Danna'),
    ('Preescolar', 'Tercero', 'A', 'Martinez Sánchez Ellise Danielle'),
    ('Preescolar', 'Tercero', 'A', 'Melchor Rendón Juan Pablo'),
    ('Preescolar', 'Tercero', 'A', 'Mendez López Ashley Arleth'),
    ('Preescolar', 'Tercero', 'A', 'Moreno Niño Marco Eydan'),
    ('Preescolar', 'Tercero', 'A', 'Muñoz López Eder Giovanni'),
    ('Preescolar', 'Tercero', 'A', 'Osorio Hernández Rogelio Manuel'),
    ('Preescolar', 'Tercero', 'A', 'Rodriguez Coria Kelany Sofia'),
    ('Preescolar', 'Tercero', 'A', 'Crtuz Rogel Emma Daniela'),
    ('Preescolar', 'Tercero', 'A', 'Ruiz Santos Farid Camal'),
    ('Preescolar', 'Tercero', 'A', 'Uribe Castillo Aitana Massiel'),
    ('Preescolar', 'Tercero', 'A', 'Valencia Vargas Ximena'),

    ('Preescolar', 'Primero', 'A', 'Almazan Castro Isabella'),
    ('Preescolar', 'Primero', 'A', 'Bahena Muñoz Gala Camila'),
    ('Preescolar', 'Primero', 'A', 'Barrera Garibay Sofia Victoria'),
    ('Preescolar', 'Primero', 'A', 'Cabrera Reza Jose Adriel'),
    ('Preescolar', 'Primero', 'A', 'Calderon Ramos Carla Keylani'),
    ('Preescolar', 'Primero', 'A', 'Castro Vazquez Naim Argel'),
    ('Preescolar', 'Primero', 'A', 'De León García Adaya Regina'),
    ('Preescolar', 'Primero', 'A', 'González Bello Marco Edoardo'),
    ('Preescolar', 'Primero', 'A', 'Guadalupe Díaz Santiago'),
    ('Preescolar', 'Primero', 'A', 'Leyva Cornejo Dorian André'),
    ('Preescolar', 'Primero', 'A', 'Mojica Vargas Liam Gabriel'),
    ('Preescolar', 'Primero', 'A', 'Mundo Patricio Maximo Alejandro'),
    ('Preescolar', 'Primero', 'A', 'Muñoz Ortiz Alejandro'),
    ('Preescolar', 'Primero', 'A', 'Perez Moyorido Emiliano Aldair'),
    ('Preescolar', 'Primero', 'A', 'Pujol Flores Aria'),
    ('Preescolar', 'Primero', 'A', 'Reyes Bahena Yoselin Arlet'),
    ('Preescolar', 'Primero', 'A', 'Rivas Valencia Monica'),
    ('Preescolar', 'Primero', 'A', 'Torres Becerra Ximena'),
    ('Preescolar', 'Primero', 'A', 'Torres Pujol Aldo'),
    ('Preescolar', 'Primero', 'A', 'Vazquez Juárez Alicia Camila'),
    ('Preescolar', 'Primero', 'A', 'Vidal González Daia Kalani'),

    ('Maternal', 'Maternal', 'A', 'Alanis Salgado Daniela Eilyn'),
    ('Maternal', 'Maternal', 'A', 'Barcenas Tufiño Josue'),
    ('Maternal', 'Maternal', 'A', 'Cabrera Reza Kailany'),
    ('Maternal', 'Maternal', 'A', 'Canales Velasco Victoria Nikte-ha'),
    ('Maternal', 'Maternal', 'A', 'Castro Lara Noah'),
    ('Maternal', 'Maternal', 'A', 'Flores Flores Joselin Isabella'),
    ('Maternal', 'Maternal', 'A', 'Giron Arroyo André Sebastian'),
    ('Maternal', 'Maternal', 'A', 'Gómez Plata Joan André'),
    ('Maternal', 'Maternal', 'A', 'Jiménez Gómez Julieta Sofia'),
    ('Maternal', 'Maternal', 'A', 'Leonel Pujol Grettel'),
    ('Maternal', 'Maternal', 'A', 'Mariaca Mora Ailany Camila'),
    ('Maternal', 'Maternal', 'A', 'Munive Maldonado Leonardo'),
    ('Maternal', 'Maternal', 'A', 'Olvera Nava Gabriel'),
    ('Maternal', 'Maternal', 'A', 'Pérez López Thadeo Alejandro'),
    ('Maternal', 'Maternal', 'A', 'Reyes Abarca Gustavo'),
    ('Maternal', 'Maternal', 'A', 'Santoyo Ortiz Jimena'),
    ('Maternal', 'Maternal', 'A', 'Soto Guadalupe Isabella Maat')
), prepared as (
  select tenant.id as tenant_id, tenant.initial_superuser_id as actor_id,
         groups.id as group_id, roster.full_name,
         btrim(regexp_replace(
           regexp_replace(lower(extensions.unaccent(roster.full_name)), '[^a-z0-9[:space:]]', ' ', 'g'),
           '[[:space:]]+', ' ', 'g'
         )) as normalized_name
  from public.tenants as tenant
  join roster on true
  join public.filter_levels as levels
    on levels.tenant_id = tenant.id and levels.name = roster.level_name
  join public.filter_groups as groups
    on groups.tenant_id = tenant.id
   and groups.level_id = levels.id
   and groups.grade_name = roster.grade_name
   and groups.group_name = roster.group_name
  where tenant.slug = 'xochitlan'
)
insert into public.filter_students (
  tenant_id, group_id, full_name, normalized_name, active, created_by, updated_by
)
select tenant_id, group_id, full_name, normalized_name, true, actor_id, actor_id
from prepared
on conflict (tenant_id, group_id, normalized_name) do update set
  full_name = excluded.full_name,
  active = true,
  updated_at = now(),
  updated_by = excluded.updated_by;

insert into public.filter_audit_log (
  tenant_id, actor_user_id, actor_name, action, entity_type, details
)
select tenant.id, tenant.initial_superuser_id, 'Mantenimiento autorizado',
       'students.pdf_imported', 'student',
       jsonb_build_object(
         'source', 'mn j k.pdf',
         'levels', jsonb_build_array('Maternal', 'Preescolar'),
         'groups', 4,
         'rows', 77
       )
from public.tenants as tenant
where tenant.slug = 'xochitlan';

-- Elimina únicamente el retardo falso identificado previamente. La entrada de
-- auditoría preserva quién, cuándo y por qué se retiró el dato de prueba.
insert into public.filter_audit_log (
  tenant_id, actor_user_id, actor_name, action, entity_type, entity_id, details
)
select late.tenant_id, tenant.initial_superuser_id, 'Mantenimiento autorizado',
       'late_entry.test_deleted', 'late_entry', late.id::text,
       jsonb_build_object(
         'studentId', late.student_id,
         'studentName', student.full_name,
         'arrivedAt', late.arrived_at,
         'reasonCode', late.reason_code,
         'reasonDetail', late.reason_detail,
         'reporterName', late.reporter_name,
         'evidencePath', late.evidence_path
       )
from public.filter_late_entries as late
join public.filter_students as student
  on student.id = late.student_id and student.tenant_id = late.tenant_id
join public.tenants as tenant on tenant.id = late.tenant_id
where late.id = '5d9cb1c6-f44b-46e1-833e-024e57a194eb'::uuid
  and tenant.slug = 'xochitlan'
  and student.normalized_name = 'trujillo reyes jose aldo';

delete from public.filter_late_entries
where id = '5d9cb1c6-f44b-46e1-833e-024e57a194eb'::uuid
  and tenant_id = (
    select id from public.tenants where slug = 'xochitlan'
  );

do $verify$
declare
  imported_count integer;
begin
  select count(*) into imported_count
  from public.filter_students as students
  join public.filter_groups as groups on groups.id = students.group_id
  join public.filter_levels as levels on levels.id = groups.level_id
  join public.tenants as tenant on tenant.id = students.tenant_id
  where tenant.slug = 'xochitlan'
    and students.active
    and (
      (levels.name = 'Maternal' and groups.grade_name = 'Maternal' and groups.group_name = 'A')
      or (levels.name = 'Preescolar' and groups.grade_name in ('Primero', 'Segundo', 'Tercero') and groups.group_name = 'A')
    );

  if imported_count <> 77 then
    raise exception 'La importación del padrón no produjo 77 alumnos activos; produjo %.', imported_count;
  end if;

  if exists (
    select 1 from public.filter_late_entries
    where id = '5d9cb1c6-f44b-46e1-833e-024e57a194eb'::uuid
  ) then
    raise exception 'El retardo falso de prueba no fue eliminado.';
  end if;
end
$verify$;
