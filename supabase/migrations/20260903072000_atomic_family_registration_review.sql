alter table public.filter_family_registrations
  add constraint filter_family_registrations_invite_key unique (invite_id);
create unique index filter_guardian_external_registration_unique
  on public.filter_guardian_contacts (external_registration_id)
  where external_registration_id is not null;

create or replace function public.review_filter_family_registration(target_tenant_id uuid,target_registration_id uuid,target_student_id uuid,target_status text,target_notes text,actor_id uuid,actor_name text)
returns void language plpgsql security definer set search_path='' as $$
declare reg public.filter_family_registrations%rowtype; relation text; reviewed timestamptz:=now();
begin
 if target_status not in ('approved','rejected','duplicate') then raise exception 'Estado inválido'; end if;
 if not exists(select 1 from public.profiles where id=actor_id and tenant_id=target_tenant_id and rol in ('superuser','admin','encargado_filtro') and estatus='activo') then raise exception 'No autorizado'; end if;
 if not exists(select 1 from public.filter_students where id=target_student_id and tenant_id=target_tenant_id and active) then raise exception 'Alumno destino inválido'; end if;
 select * into reg from public.filter_family_registrations where id=target_registration_id and tenant_id=target_tenant_id for update;
 if not found then raise exception 'Solicitud no encontrada'; end if;
 update public.filter_family_registrations set student_id=target_student_id,status=target_status,review_notes=nullif(btrim(target_notes),''),reviewed_by=actor_id,reviewed_at=reviewed,updated_at=reviewed where id=reg.id;
 update public.filter_registration_pickup_people set student_id=target_student_id,verification_status=case when target_status='approved' then 'verified' else 'rejected' end,verified_by=actor_id,verified_at=reviewed,updated_at=reviewed where registration_id=reg.id and tenant_id=target_tenant_id;
 if target_status='approved' then
  relation:=case when reg.relationship in ('madre','padre','tutor') then reg.relationship else 'tutor' end;
  insert into public.filter_guardian_contacts(tenant_id,student_id,full_name,relationship,phone,email,source,verification_status,verified_at,verified_by,external_registration_id,active,created_by,updated_by)
  values(target_tenant_id,target_student_id,reg.guardian_name,relation,reg.phone,reg.email,'qr_self_service','verified',reviewed,actor_id,reg.id,true,actor_id,actor_id)
  on conflict(external_registration_id) where external_registration_id is not null do update set student_id=excluded.student_id,full_name=excluded.full_name,relationship=excluded.relationship,phone=excluded.phone,email=excluded.email,verification_status='verified',verified_at=reviewed,verified_by=actor_id,active=true,updated_by=actor_id,updated_at=reviewed;
 else
  update public.filter_guardian_contacts set active=false,verification_status=case when target_status='rejected' then 'rejected' else 'revoked' end,updated_by=actor_id,updated_at=reviewed where tenant_id=target_tenant_id and external_registration_id=reg.id;
 end if;
 insert into public.filter_audit_log(tenant_id,actor_user_id,actor_name,action,entity_type,entity_id,details) values(target_tenant_id,actor_id,actor_name,'family_registration.reviewed','family_registration',reg.id,jsonb_build_object('status',target_status,'previousStudentId',reg.student_id,'studentId',target_student_id));
end;$$;

create or replace function public.submit_filter_family_registration(target_invite_id uuid,expected_tenant_id uuid,target_request_id uuid,registration_data jsonb,people_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.filter_family_invites%rowtype; result_id uuid; person jsonb;
begin
 select * into inv from public.filter_family_invites where id=target_invite_id for update;
 if not found or inv.tenant_id<>expected_tenant_id or not inv.active or inv.expires_at<=now() or inv.used_count>=inv.max_uses then raise exception 'El enlace ya no está disponible'; end if;
 select id into result_id from public.filter_family_registrations where tenant_id=inv.tenant_id and client_request_id=target_request_id;
 if result_id is not null then return result_id; end if;
 insert into public.filter_family_registrations(tenant_id,student_id,invite_id,client_request_id,guardian_name,relationship,relationship_other,phone,email,identification_reference,identification_front_path,identification_back_path,face_photo_path,signature_path,privacy_consent)
 values(inv.tenant_id,inv.student_id,inv.id,target_request_id,registration_data->>'guardianName',registration_data->>'relationship',nullif(registration_data->>'relationshipOther',''),registration_data->>'phone',nullif(registration_data->>'email',''),registration_data->>'identificationReference',registration_data->>'identificationFrontPath',nullif(registration_data->>'identificationBackPath',''),registration_data->>'facePhotoPath',registration_data->>'signaturePath',coalesce((registration_data->>'privacyConsent')::boolean,false)) returning id into result_id;
 for person in select value from jsonb_array_elements(coalesce(people_data,'[]'::jsonb)) loop
  insert into public.filter_registration_pickup_people(tenant_id,registration_id,student_id,full_name,relationship,phone,identification_reference,identification_path,face_photo_path)
  values(inv.tenant_id,result_id,inv.student_id,person->>'fullName',person->>'relationship',nullif(person->>'phone',''),nullif(person->>'identificationReference',''),nullif(person->>'identificationPath',''),person->>'facePhotoPath');
 end loop;
 update public.filter_family_invites set used_count=used_count+1,active=(used_count+1<max_uses) where id=inv.id;
 insert into public.filter_audit_log(tenant_id,actor_name,action,entity_type,entity_id,details) values(inv.tenant_id,'Registro familiar por enlace seguro','family_registration.submitted','family_registration',result_id,jsonb_build_object('studentId',inv.student_id,'authorizedPeopleCount',jsonb_array_length(coalesce(people_data,'[]'::jsonb))));
 return result_id;
end;$$;

revoke all on function public.review_filter_family_registration(uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.review_filter_family_registration(uuid,uuid,uuid,text,text,uuid,text) to service_role;
revoke all on function public.submit_filter_family_registration(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_filter_family_registration(uuid,uuid,uuid,jsonb,jsonb) to service_role;
