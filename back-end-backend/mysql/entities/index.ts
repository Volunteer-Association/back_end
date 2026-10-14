import { UserEntity } from './user.entity.js';
import { OAuthIdentityEntity } from './oauth-identity.entity.js';
import { OAuthLoginCodeEntity } from './oauth-login-code.entity.js';
import { OAuthStateEntity } from './oauth-state.entity.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
import { LogEntity } from './log.entity.js';
import { UserProfileEntity } from './user-profile.entity.js';
import { RoleEntity } from './role.entity.js';
import { EmailVerificationEntity } from './email-verification.entity.js';
import { BillEntity } from './bill.entity.js';
import { DictItemEntity } from './dict-item.entity.js';
import { UserBalanceEntity } from './user-balance.entity.js';
import { RechargeOrderEntity } from './recharge-order.entity.js';
import { BalanceTransactionEntity } from './balance-transaction.entity.js';
import { IdempotencyKeyEntity } from './idempotency-key.entity.js';
import { NotificationEntity } from './notification.entity.js';

export { UserEntity };
export { UserProfileEntity, RoleEntity, EmailVerificationEntity };
export { BillEntity, DictItemEntity };
export { UserBalanceEntity, RechargeOrderEntity, BalanceTransactionEntity };
export { IdempotencyKeyEntity };
export { NotificationEntity };
export {
  OAuthIdentityEntity,
  OAuthLoginCodeEntity,
  OAuthStateEntity,
  RefreshTokenEntity,
  LogEntity,
};
export type { UserRole, UserStatus } from './user.entity.js';
export type { OAuthProvider } from './oauth-identity.entity.js';
export type { LogCategory, LogLevel } from './log.entity.js';
export type { RechargeChannel, RechargeStatus } from './recharge-order.entity.js';
export type { BalanceTxnType } from './balance-transaction.entity.js';
export type { NotificationType } from './notification.entity.js';

export const DATABASE_ENTITIES = [
  UserEntity,
  OAuthIdentityEntity,
  OAuthLoginCodeEntity,
  OAuthStateEntity,
  RefreshTokenEntity,
  LogEntity,
  UserProfileEntity,
  RoleEntity,
  EmailVerificationEntity,
  BillEntity,
  DictItemEntity,
  UserBalanceEntity,
  RechargeOrderEntity,
  BalanceTransactionEntity,
  IdempotencyKeyEntity,
  NotificationEntity,
] as const;
