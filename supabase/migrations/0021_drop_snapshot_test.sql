-- Remove the temporary gateless verification function (was validated against
-- 0016's real RPC, which is superadmin-gated and unchanged).
drop function if exists public.admin_store_snapshot_test();
notify pgrst, 'reload schema';