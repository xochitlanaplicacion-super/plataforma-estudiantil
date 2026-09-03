drop policy if exists filter_tenant_access on public.filter_audit_log;
drop policy if exists filter_audit_read on public.filter_audit_log;

create policy filter_audit_read on public.filter_audit_log
for select to authenticated
using ((select private.has_filter_access(tenant_id)));

revoke insert, update, delete on public.filter_audit_log from authenticated;
grant select on public.filter_audit_log to authenticated;
