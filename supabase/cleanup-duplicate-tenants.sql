-- Cleanup: Remove duplicate tenants and pending invitations
-- Run this in Supabase Dashboard > SQL Editor

-- 1. See what exists first
SELECT id, business_name, created_at FROM tenants ORDER BY created_at;
SELECT * FROM tenant_invitations ORDER BY created_at;

-- 2. Delete pending invitations first (foreign key dependency)
DELETE FROM tenant_invitations WHERE status = 'pending';

-- 3. Delete the duplicate tenants (keep the one with the most recent created_at)
-- Adjust the WHERE clause to keep the correct one
DELETE FROM tenants
WHERE id NOT IN (
  SELECT id FROM tenants
  ORDER BY created_at DESC
  LIMIT 1
);

-- 4. Verify cleanup
SELECT id, business_name, created_at FROM tenants;
SELECT * FROM tenant_invitations;
