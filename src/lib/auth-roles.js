// Role helpers. A user's role lives on the profile; a platform owner may also
// carry platform_role: 'superadmin'. The "admin" gate treats both store admins
// and superadmins as privileged (superadmins can also operate stores).

export const isSuperadmin = (user) =>
  Boolean(user) && (user.platform_role === 'superadmin' || user.role === 'superadmin')

export const isAdmin = (user) =>
  Boolean(user) && (user.role === 'admin' || user.platform_role === 'superadmin' || user.role === 'superadmin')

export const isCashier = (user) =>
  Boolean(user) && (user.role === 'cashier' || user.role === 'user')
