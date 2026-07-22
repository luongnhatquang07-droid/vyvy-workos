-- Phase A1c: repair the A1a access-helper ACL on the public schema.
--
-- postgres has public-schema default privileges that grant EXECUTE on newly
-- created functions to service_role. A1a revoked PUBLIC but did not revoke that
-- direct service_role grant, so public differed from the disposable-schema
-- gate. Revoke every relevant role explicitly, then expose only to authenticated
-- as intended by the A1a RLS policies.

begin;

do $fix_helper_acl$
begin
  if pg_catalog.to_regprocedure(
    'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)'
  ) is null then
    raise notice
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text) is absent; ACL repair skipped.';
    return;
  end if;

  execute 'revoke execute on function '
    || 'public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) '
    || 'from public, anon, authenticated, service_role';

  execute 'grant execute on function '
    || 'public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) '
    || 'to authenticated';

  execute $comment$
    comment on function
      public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text)
    is 'A1a RLS access helper. ACL is explicit because public-schema default privileges grant function EXECUTE to service_role; only authenticated clients may call this helper.'
  $comment$;

  if not pg_catalog.has_function_privilege(
      'authenticated',
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    ) then
    raise exception using
      errcode = '55000',
      message = 'A1a access-helper ACL repair postcondition failed.';
  end if;
end
$fix_helper_acl$;

commit;
