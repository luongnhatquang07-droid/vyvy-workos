-- Rollback for 202607210005_fix_helper_acl.sql.
--
-- This intentionally restores the ACL state observed immediately before the
-- fix: authenticated and service_role can execute the helper, while anon and
-- PUBLIC cannot. That state is known to be broader than the A1a design intent;
-- this rollback restores history, it does not repair the root default-privilege
-- behavior on the public schema.

begin;

do $restore_helper_acl$
begin
  if pg_catalog.to_regprocedure(
    'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)'
  ) is null then
    raise notice
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text) is absent; ACL restore skipped.';
    return;
  end if;

  execute 'revoke execute on function '
    || 'public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) '
    || 'from authenticated';

  execute 'grant execute on function '
    || 'public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) '
    || 'to service_role, authenticated';

  -- A1a had no COMMENT ON FUNCTION for this helper. Remove the forward-fix
  -- comment so rollback restores both ACL and catalog comment state.
  execute 'comment on function '
    || 'public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) '
    || 'is null';

  if not pg_catalog.has_function_privilege(
      'authenticated',
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    ) then
    raise exception using
      errcode = '55000',
      message = 'A1a access-helper ACL restore postcondition failed.';
  end if;
end
$restore_helper_acl$;

commit;
