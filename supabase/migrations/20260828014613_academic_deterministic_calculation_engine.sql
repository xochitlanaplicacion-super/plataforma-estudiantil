-- Paso 7: motor determinista y explicable. Todos los cálculos SQL usan
-- numeric; la salida contractual usa decimales fijos como texto para evitar
-- diferencias de serialización entre PostgreSQL y JavaScript.
set search_path = '';

create or replace function private.academic_evaluate_sources(
  p_sources jsonb,
  p_period_state text,
  p_criterion_id text,
  p_subcriterion_id text default null
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  source jsonb;
  source_state text;
  source_scale text;
  source_id text;
  raw_value numeric;
  ratio_value numeric(18,8);
  ratio_sum numeric(24,8) := 0;
  included_count integer := 0;
  source_breakdown jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_sources, '[]'::jsonb)) <> 'array' then
    raise exception 'sources debe ser un arreglo' using errcode = '22023';
  end if;
  for source in
    select value from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb))
    order by value ->> 'id'
  loop
    source_id := source ->> 'id';
    source_state := source ->> 'state';
    source_scale := source ->> 'scale';
    if source_id is null
       or source_state not in ('sin_capturar','pendiente','entregado','tardio','no_entregado','justificado','calificado')
       or source_scale not in ('0-1', '0-10') then
      raise exception 'Fuente académica incompleta' using errcode = '22023';
    end if;
    ratio_value := null;
    if source_state = 'calificado' then
      if source -> 'value' is null or source -> 'value' = 'null'::jsonb then
        raise exception 'El estado calificado exige valor' using errcode = '22023';
      end if;
      raw_value := (source ->> 'value')::numeric;
      if (source_scale = '0-1' and raw_value not between 0 and 1)
         or (source_scale = '0-10' and raw_value not between 0 and 10) then
        raise exception 'El valor de fuente esta fuera de rango' using errcode = '22003';
      end if;
      ratio_value := round(case when source_scale = '0-1' then raw_value else raw_value / 10 end, 8);
    elsif source_state = 'no_entregado' and p_period_state = 'cerrado' then
      if source -> 'value' is not null and source -> 'value' <> 'null'::jsonb then
        raise exception 'No entregado no admite valor' using errcode = '22023';
      end if;
      ratio_value := 0.00000000;
    else
      if source -> 'value' is not null and source -> 'value' <> 'null'::jsonb then
        raise exception 'El estado no admite valor' using errcode = '22023';
      end if;
      warnings := warnings || jsonb_build_array(jsonb_build_object(
        'code', case
          when source_state = 'justificado' then 'JUSTIFIED_EXCLUDED'
          when source_state = 'no_entregado' then 'NOT_SUBMITTED_OPEN_PERIOD'
          when coalesce((source ->> 'zeroDenominatorExcluded')::boolean, false) then 'ZERO_DENOMINATOR_EXCLUDED'
          else 'PENDING_SOURCE'
        end,
        'criterionId', p_criterion_id,
        'subcriterionId', p_subcriterion_id,
        'sourceId', source_id
      ));
    end if;
    if ratio_value is not null then
      ratio_sum := ratio_sum + ratio_value;
      included_count := included_count + 1;
    end if;
    source_breakdown := source_breakdown || jsonb_build_array(jsonb_build_object(
      'sourceId', source_id,
      'state', source_state,
      'included', ratio_value is not null,
      'ratio', case when ratio_value is null then null else to_char(ratio_value, 'FM990.00000000') end,
      'canonicalGrade', case when ratio_value is null then null else to_char(round(ratio_value * 10, 4), 'FM990.0000') end
    ));
  end loop;
  if included_count = 0 then
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'code', 'NO_COMPUTABLE_SOURCES', 'criterionId', p_criterion_id,
      'subcriterionId', p_subcriterion_id, 'sourceId', null
    ));
  end if;
  return jsonb_build_object(
    'ratio', case when included_count = 0 then null else round(ratio_sum / included_count, 8) end,
    'sources', source_breakdown,
    'warnings', warnings
  );
end;
$$;

revoke all on function private.academic_evaluate_sources(jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function private.academic_evaluate_sources(jsonb, text, text, text)
  to authenticated, service_role;

create or replace function public.calcular_calificacion_academica(p_dataset jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  criterion jsonb;
  subcriterion jsonb;
  evaluated jsonb;
  internal_criteria jsonb := '[]'::jsonb;
  internal_subcriteria jsonb;
  criteria_output jsonb := '[]'::jsonb;
  subcriteria_output jsonb;
  warnings jsonb := '[]'::jsonb;
  criterion_weight numeric(7,4);
  sub_weight numeric(7,4);
  ratio_value numeric(18,8);
  sub_denominator numeric(14,4);
  denominator numeric(14,4);
  contribution numeric(18,4);
  contribution_total numeric(18,4) := 0;
  effective_weight numeric(18,4);
  display_decimals integer;
  period_state text;
  complete_result boolean;
begin
  if p_dataset is null or jsonb_typeof(p_dataset) <> 'object'
     or jsonb_typeof(p_dataset -> 'criteria') <> 'array' then
    raise exception 'Dataset académico inválido' using errcode = '22023';
  end if;
  if pg_column_size(p_dataset) > 1048576
     or jsonb_array_length(p_dataset -> 'criteria') > 100 then
    raise exception 'Dataset académico excede el límite seguro' using errcode = '54000';
  end if;
  if (select coalesce(sum(jsonb_array_length(coalesce(c -> 'sources', '[]'::jsonb))), 0)
      + coalesce(sum((select coalesce(sum(jsonb_array_length(coalesce(s -> 'sources', '[]'::jsonb))), 0)
                      from jsonb_array_elements(coalesce(c -> 'subcriteria', '[]'::jsonb)) s)), 0)
      from jsonb_array_elements(p_dataset -> 'criteria') c) > 1000 then
    raise exception 'Dataset académico excede 1000 fuentes' using errcode = '54000';
  end if;
  period_state := p_dataset ->> 'periodState';
  display_decimals := (p_dataset ->> 'displayDecimals')::integer;
  if period_state not in ('borrador', 'activo', 'cerrado')
     or display_decimals not between 0 and 2
     or p_dataset ->> 'roundingMode' <> 'half_up' then
    raise exception 'Política de cálculo inválida' using errcode = '22023';
  end if;

  for criterion in
    select value from jsonb_array_elements(p_dataset -> 'criteria')
    order by (value ->> 'order')::integer, value ->> 'id'
  loop
    criterion_weight := (criterion ->> 'weight')::numeric;
    if criterion_weight not between 0 and 100 then
      raise exception 'Peso de criterio fuera de rango' using errcode = '22003';
    end if;
    internal_subcriteria := '[]'::jsonb;
    if jsonb_array_length(coalesce(criterion -> 'subcriteria', '[]'::jsonb)) = 0 then
      if criterion ->> 'type' = 'hibrido' then
        raise exception 'Un criterio híbrido exige subcriterios' using errcode = '22023';
      end if;
      evaluated := private.academic_evaluate_sources(
        criterion -> 'sources', period_state, criterion ->> 'id', null
      );
      warnings := warnings || evaluated -> 'warnings';
      ratio_value := (evaluated ->> 'ratio')::numeric;
    else
      if jsonb_array_length(coalesce(criterion -> 'sources', '[]'::jsonb)) > 0 then
        raise exception 'El padre con subcriterios no admite fuentes' using errcode = '22023';
      end if;
      for subcriterion in
        select value from jsonb_array_elements(criterion -> 'subcriteria')
        order by (value ->> 'order')::integer, value ->> 'id'
      loop
        sub_weight := (subcriterion ->> 'internalWeight')::numeric;
        if sub_weight not between 0 and 100 then
          raise exception 'Peso interno fuera de rango' using errcode = '22003';
        end if;
        evaluated := private.academic_evaluate_sources(
          subcriterion -> 'sources', period_state,
          criterion ->> 'id', subcriterion ->> 'id'
        );
        warnings := warnings || evaluated -> 'warnings';
        internal_subcriteria := internal_subcriteria || jsonb_build_array(
          subcriterion || jsonb_build_object(
            '__weight', sub_weight,
            '__ratio', evaluated -> 'ratio',
            '__sources', evaluated -> 'sources'
          )
        );
      end loop;
      if (select coalesce(sum((s ->> '__weight')::numeric), 0)
          from jsonb_array_elements(internal_subcriteria) s) <> 100.0000 then
        raise exception 'Los pesos internos deben sumar 100.0000' using errcode = '23514';
      end if;
      select coalesce(sum((s ->> '__weight')::numeric), 0)
      into sub_denominator
      from jsonb_array_elements(internal_subcriteria) s
      where s -> '__ratio' <> 'null'::jsonb and (s ->> '__weight')::numeric > 0;
      select case when sub_denominator = 0 then null else round(
        sum((s ->> '__ratio')::numeric * (s ->> '__weight')::numeric) / sub_denominator, 8
      ) end
      into ratio_value
      from jsonb_array_elements(internal_subcriteria) s
      where s -> '__ratio' <> 'null'::jsonb and (s ->> '__weight')::numeric > 0;
      evaluated := jsonb_build_object('sources', '[]'::jsonb);
    end if;
    internal_criteria := internal_criteria || jsonb_build_array(
      criterion || jsonb_build_object(
        '__weight', criterion_weight,
        '__ratio', to_jsonb(ratio_value),
        '__sources', evaluated -> 'sources',
        '__subcriteria', internal_subcriteria
      )
    );
  end loop;

  if (select coalesce(sum((c ->> '__weight')::numeric), 0)
      from jsonb_array_elements(internal_criteria) c) <> 100.0000 then
    raise exception 'Los pesos de criterios deben sumar 100.0000' using errcode = '23514';
  end if;
  select coalesce(sum((c ->> '__weight')::numeric), 0)
  into denominator
  from jsonb_array_elements(internal_criteria) c
  where c -> '__ratio' <> 'null'::jsonb and (c ->> '__weight')::numeric > 0;
  if denominator = 0 then
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'code', 'NO_COMPUTABLE_CRITERIA', 'criterionId', null,
      'subcriterionId', null, 'sourceId', null
    ));
  end if;

  for criterion in select value from jsonb_array_elements(internal_criteria)
  loop
    ratio_value := (criterion ->> '__ratio')::numeric;
    criterion_weight := (criterion ->> '__weight')::numeric;
    effective_weight := case when ratio_value is null or denominator = 0 then 0
      else round(criterion_weight * 100 / denominator, 4) end;
    contribution := case when ratio_value is null or denominator = 0 then 0
      else round(ratio_value * 10 * criterion_weight / denominator, 4) end;
    contribution_total := contribution_total + contribution;
    subcriteria_output := '[]'::jsonb;
    select coalesce(sum((s ->> '__weight')::numeric), 0)
    into sub_denominator
    from jsonb_array_elements(criterion -> '__subcriteria') s
    where s -> '__ratio' <> 'null'::jsonb and (s ->> '__weight')::numeric > 0;
    for subcriterion in select value from jsonb_array_elements(criterion -> '__subcriteria')
    loop
      sub_weight := (subcriterion ->> '__weight')::numeric;
      ratio_value := (subcriterion ->> '__ratio')::numeric;
      subcriteria_output := subcriteria_output || jsonb_build_array(jsonb_build_object(
        'subcriterionId', subcriterion ->> 'id',
        'label', subcriterion ->> 'label',
        'originalWeight', to_char(sub_weight, 'FM990.0000'),
        'effectiveWeight', to_char(case when ratio_value is null or sub_denominator = 0 then 0 else round(sub_weight * 100 / sub_denominator, 4) end, 'FM990.0000'),
        'ratio', case when ratio_value is null then null else to_char(ratio_value, 'FM990.00000000') end,
        'canonicalGrade', case when ratio_value is null then null else to_char(round(ratio_value * 10, 4), 'FM990.0000') end,
        'contributionToCriterion', to_char(case when ratio_value is null or sub_denominator = 0 then 0 else round(ratio_value * 10 * sub_weight / sub_denominator, 4) end, 'FM990.0000'),
        'contributionToTotal', to_char(case when ratio_value is null or sub_denominator = 0 or denominator = 0 then 0 else round(ratio_value * 10 * sub_weight * criterion_weight / sub_denominator / denominator, 4) end, 'FM990.0000'),
        'sources', subcriterion -> '__sources'
      ));
    end loop;
    ratio_value := (criterion ->> '__ratio')::numeric;
    criteria_output := criteria_output || jsonb_build_array(jsonb_build_object(
      'criterionId', criterion ->> 'id',
      'label', criterion ->> 'label',
      'originalWeight', to_char(criterion_weight, 'FM990.0000'),
      'effectiveWeight', to_char(effective_weight, 'FM990.0000'),
      'ratio', case when ratio_value is null then null else to_char(ratio_value, 'FM990.00000000') end,
      'canonicalGrade', case when ratio_value is null then null else to_char(round(ratio_value * 10, 4), 'FM990.0000') end,
      'contributionToTotal', to_char(contribution, 'FM990.0000'),
      'subcriteria', subcriteria_output,
      'sources', criterion -> '__sources'
    ));
  end loop;
  complete_result := not jsonb_path_exists(
    warnings,
    '$[*] ? (@.code == "PENDING_SOURCE" || @.code == "NOT_SUBMITTED_OPEN_PERIOD" || @.code == "ZERO_DENOMINATOR_EXCLUDED" || @.code == "NO_COMPUTABLE_SOURCES" || @.code == "NO_COMPUTABLE_CRITERIA")'
  );
  return jsonb_build_object(
    'engineVersion', 'academic-deterministic-v1',
    'scale', '0-10',
    'exactGrade', case when denominator = 0 then null else to_char(contribution_total, 'FM990.0000') end,
    'displayGrade', case when denominator = 0 then null when display_decimals = 0 then to_char(round(contribution_total, 0), 'FM990') when display_decimals = 1 then to_char(round(contribution_total, 1), 'FM990.0') else to_char(round(contribution_total, 2), 'FM990.00') end,
    'displayDecimals', display_decimals,
    'complete', complete_result,
    'criteria', criteria_output,
    'warnings', warnings
  );
end;
$$;

revoke all on function public.calcular_calificacion_academica(jsonb)
  from public, anon, authenticated;
grant execute on function public.calcular_calificacion_academica(jsonb)
  to authenticated, service_role;

-- Adaptador SQL de lectura: carga el conjunto RLS-safe una vez, lo acota y lo
-- entrega al motor puro. No usa SECURITY DEFINER ni acepta tenant_id del cliente.
create or replace function public.calcular_resultado_academico(
  p_asignacion_id uuid,
  p_inscripcion_id uuid,
  p_periodo_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  dataset jsonb;
  source_count integer;
begin
  select count(*) into source_count
  from public.vista_desglose_calificacion v
  where v.asignacion_profesor_id = p_asignacion_id
    and v.inscripcion_alumno_id = p_inscripcion_id
    and v.periodo_evaluacion_id = p_periodo_id;
  if source_count = 0 then
    raise exception 'El resultado académico no existe o no está disponible' using errcode = 'P0002';
  end if;
  if source_count > 1000 then
    raise exception 'El desglose excede el límite seguro' using errcode = '54000';
  end if;

  with rows as materialized (
    select v.*
    from public.vista_desglose_calificacion v
    where v.asignacion_profesor_id = p_asignacion_id
      and v.inscripcion_alumno_id = p_inscripcion_id
      and v.periodo_evaluacion_id = p_periodo_id
  ), subcriterion_sources as (
    select r.criterio_evaluacion_id, r.subcriterio_evaluacion_id,
      min(r.subcriterio_nombre) as label, min(r.subcriterio_tipo) as type,
      min(r.peso_interno) as internal_weight,
      jsonb_agg(jsonb_build_object(
        'id', coalesce(r.fuente_id::text, 'participation:' || r.criterio_evaluacion_id::text || ':' || r.subcriterio_evaluacion_id::text),
        'state', r.estado, 'scale', r.escala_fuente, 'value', r.valor_fuente,
        'zeroDenominatorExcluded', r.tipo_fuente='participation' and r.estado='pendiente' and r.valor_fuente is null
      ) order by r.fuente_id nulls last) as sources
    from rows r where r.subcriterio_evaluacion_id is not null
    group by r.criterio_evaluacion_id, r.subcriterio_evaluacion_id
  ), subcriteria as (
    select s.criterio_evaluacion_id,
      jsonb_agg(jsonb_build_object(
        'id', s.subcriterio_evaluacion_id, 'label', s.label, 'type', s.type,
        'internalWeight', s.internal_weight, 'order', row_number_value,
        'sources', s.sources
      ) order by s.subcriterio_evaluacion_id) as items
    from (
      select ss.*, row_number() over (partition by ss.criterio_evaluacion_id order by ss.subcriterio_evaluacion_id) as row_number_value
      from subcriterion_sources ss
    ) s group by s.criterio_evaluacion_id
  ), parent_sources as (
    select r.criterio_evaluacion_id,
      jsonb_agg(jsonb_build_object(
        'id', coalesce(r.fuente_id::text, 'participation:' || r.criterio_evaluacion_id::text || ':parent'),
        'state', r.estado, 'scale', r.escala_fuente, 'value', r.valor_fuente,
        'zeroDenominatorExcluded', r.tipo_fuente='participation' and r.estado='pendiente' and r.valor_fuente is null
      ) order by r.fuente_id nulls last) as sources
    from rows r where r.subcriterio_evaluacion_id is null
    group by r.criterio_evaluacion_id
  ), criterion_base as (
    select r.criterio_evaluacion_id, min(r.criterio_nombre) as label,
      min(r.criterio_tipo) as type, min(r.criterio_peso) as weight
    from rows r group by r.criterio_evaluacion_id
  ), criteria as (
    select jsonb_agg(jsonb_build_object(
      'id', c.criterio_evaluacion_id, 'label', c.label, 'type', c.type,
      'weight', c.weight, 'order', row_number_value,
      'sources', coalesce(p.sources, '[]'::jsonb),
      'subcriteria', coalesce(s.items, '[]'::jsonb)
    ) order by c.criterio_evaluacion_id) as items
    from (
      select cb.*, row_number() over (order by cb.criterio_evaluacion_id) as row_number_value
      from criterion_base cb
    ) c
    left join parent_sources p using (criterio_evaluacion_id)
    left join subcriteria s using (criterio_evaluacion_id)
  )
  select jsonb_build_object(
    'periodState', pe.estado,
    'displayDecimals', ee.decimales_mostrados,
    'roundingMode', ee.modo_redondeo,
    'criteria', criteria.items
  ) into dataset
  from criteria
  join public.esquemas_evaluacion ee
    on ee.asignacion_profesor_id = p_asignacion_id
   and ee.periodo_evaluacion_id = p_periodo_id and ee.estado = 'activo'
  join public.periodos_evaluacion pe
    on pe.id = ee.periodo_evaluacion_id and pe.tenant_id = ee.tenant_id;

  if dataset is null then
    raise exception 'No existe un esquema activo autorizado' using errcode = 'P0002';
  end if;
  return public.calcular_calificacion_academica(dataset);
end;
$$;

revoke all on function public.calcular_resultado_academico(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.calcular_resultado_academico(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.calcular_calificacion_academica(jsonb) is
  'Motor puro v1: ratio 0-1, calificación 0-10, ponderación y desglose decimal determinista.';
comment on function public.calcular_resultado_academico(uuid, uuid, uuid) is
  'Carga una vez un dataset autorizado y acotado; calcula sin SECURITY DEFINER ni PII.';

reset search_path;
