create or replace function public.search_filter_students(
  target_tenant_id uuid,
  search_text text,
  max_results integer default 12
)
returns table(id uuid, full_name text, group_id uuid, score real)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.full_name, s.group_id,
    greatest(
      extensions.similarity(s.normalized_name, search_text),
      extensions.word_similarity(search_text, s.normalized_name),
      case when s.normalized_name like search_text || '%' then 1.0 else 0.0 end,
      case when s.normalized_name like '%' || search_text || '%' then 0.9 else 0.0 end
    )::real as score
  from public.filter_students s
  where s.tenant_id = target_tenant_id
    and s.active
    and (
      s.normalized_name operator(extensions.%) search_text
      or extensions.word_similarity(search_text, s.normalized_name) > 0.3
      or s.normalized_name like '%' || search_text || '%'
    )
  order by score desc, s.full_name asc
  limit least(greatest(max_results, 1), 50);
$$;

revoke all on function public.search_filter_students(uuid,text,integer) from public;
grant execute on function public.search_filter_students(uuid,text,integer) to authenticated, service_role;
