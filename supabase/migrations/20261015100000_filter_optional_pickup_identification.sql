-- La credencial del adulto que retira es opcional en salidas anticipadas y
-- entregas extraordinarias; su fotografía personal sigue siendo obligatoria.
-- No modifica las identificaciones requeridas en el alta de familias.
alter table public.filter_early_departures
  alter column identification_evidence_path drop not null;

alter table public.filter_extraordinary_handoffs
  alter column identification_type drop not null,
  alter column identification_front_path drop not null;

-- Si se adjunta un documento, se conserva su tipo; no se permite guardar un
-- reverso o un tipo de documento sin el frente correspondiente.
alter table public.filter_extraordinary_handoffs
  add constraint filter_extraordinary_optional_identification_check
  check (
    (
      identification_front_path is null
      and identification_type is null
      and identification_type_other is null
      and identification_back_path is null
    )
    or (
      identification_front_path is not null
      and identification_type is not null
    )
  ) not valid;

alter table public.filter_extraordinary_handoffs
  validate constraint filter_extraordinary_optional_identification_check;

-- Una entrega sin credencial no debe registrar un cotejo documental ficticio.
-- Se conserva el resto del protocolo: adulto, autorización, consentimiento,
-- aprobación institucional, foto final y firma continúan siendo obligatorios.
alter table public.filter_extraordinary_handoffs
  drop constraint filter_extraordinary_delivery_check;

alter table public.filter_extraordinary_handoffs
  add constraint filter_extraordinary_delivery_check
  check (
    status <> 'entregado' or (
      adult_confirmed and identity_matches and no_visible_impairment
      and (
        (identification_front_path is not null and identity_status = 'coincide')
        or (identification_front_path is null and identity_status = 'no_verificable')
      )
      and consent_status = 'confirmado'
      and institution_approved and protocol_confirmed
      and departed_at is not null
      and length(btrim(coalesce(delivering_teacher_name, ''))) >= 2
      and final_handover_photo_path is not null
      and pickup_signature_path is not null
    )
  ) not valid;

alter table public.filter_extraordinary_handoffs
  validate constraint filter_extraordinary_delivery_check;
