export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** 单个 refresh token 的滑动有效期：每次刷新后重新计时。 */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
/**
 * 会话绝对生命周期：从登录那一刻起算，不管怎么刷新都不能超过。
 * 超过后必须重新输入密码登录。防止 refresh token 被无限续期。
 */
export const ABSOLUTE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** HttpOnly Cookie 中 Refresh Token 的名称。 */
export const REFRESH_COOKIE = 'refresh_token';
