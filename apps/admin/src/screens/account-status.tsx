import type { AdminUser } from '@lingualab/shared';
import { Badge } from '@lingualab/ui';

/** An account's state in words: what stops it logging in comes first. */
export function AccountStatus({ account }: { account: AdminUser }) {
  if (account.status === 'inactive') {
    return <Badge tone="muted">Inactive</Badge>;
  }
  if (account.lockedUntil !== null) {
    return <Badge tone="warn">Locked</Badge>;
  }
  if (account.mustChangePassword) {
    return <Badge tone="info">First login</Badge>;
  }
  return <Badge tone="ok">Active</Badge>;
}
