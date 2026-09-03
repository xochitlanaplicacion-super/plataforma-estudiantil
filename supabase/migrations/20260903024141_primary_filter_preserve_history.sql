alter table public.filter_late_entries
  drop constraint if exists filter_late_entries_registered_by_user_id_fkey,
  alter column registered_by_user_id drop not null,
  add constraint filter_late_entries_registered_by_user_id_fkey
    foreign key (registered_by_user_id) references auth.users(id) on delete set null;

alter table public.filter_audit_log
  drop constraint if exists filter_audit_log_actor_user_id_fkey,
  alter column actor_user_id drop not null,
  add constraint filter_audit_log_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;
