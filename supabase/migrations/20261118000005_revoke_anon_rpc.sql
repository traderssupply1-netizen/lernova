-- Admin and self-service RPCs need a signed-in user; anonymous callers get nothing.
revoke execute on function public.admin_generate_invitations(integer, public.invite_type, integer, timestamptz, text, integer, text, text, text) from public, anon;
revoke execute on function public.admin_update_invitation(uuid, public.invite_status, integer, timestamptz) from public, anon;
revoke execute on function public.admin_set_role(uuid, public.app_role, boolean) from public, anon;
revoke execute on function public.admin_set_account_status(uuid, public.account_status) from public, anon;
revoke execute on function public.my_plan() from public, anon;
revoke execute on function public.my_quota(text) from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.admin_generate_invitations(integer, public.invite_type, integer, timestamptz, text, integer, text, text, text) to authenticated;
grant execute on function public.admin_update_invitation(uuid, public.invite_status, integer, timestamptz) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status) to authenticated;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.my_quota(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
