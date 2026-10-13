import { UserEntity } from './user.entity.js';
import { OAuthIdentityEntity } from './oauth-identity.entity.js';
import { OAuthLoginCodeEntity } from './oauth-login-code.entity.js';
import { OAuthStateEntity } from './oauth-state.entity.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
import { LogEntity } from './log.entity.js';
import { UserProfileEntity } from './user-profile.entity.js';
import { RoleEntity } from './role.entity.js';
import { EmailVerificationEntity } from './email-verification.entity.js';

export { UserEntity };
export { UserProfileEntity, RoleEntity, EmailVerificationEntity };
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
] as const;
