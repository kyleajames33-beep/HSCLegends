-- Supabase default privileges can grant anon EXECUTE to recreated functions.
-- Restore the pre-existing Review RPC access boundary explicitly.
revoke all on function public.get_due_reviews(int) from public, anon;
grant execute on function public.get_due_reviews(int) to authenticated, service_role;
