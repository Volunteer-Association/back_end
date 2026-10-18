/**
 * 平台内部账户与流水类型常量。
 *
 * 提现手续费在打款成功后属于平台收入，必须落到一个明确的账户，
 * 不能只从用户余额里扣掉却无任何去向（否则手续费会"凭空消失"）。
 * 这里用一个固定的系统账户 user_id 承载累计手续费收入，
 * 它不是真实注册用户（users / pms_user 中无记录），仅在余额表与流水表中存在。
 */

/** 平台手续费收入账户ID（user_balances.user_id，最长 30 字符）。 */
export const FEE_INCOME_ACCOUNT_ID = 'PLATFORM_FEE_INCOME';

/** 平台手续费收入账户在管理后台显示的名称。 */
export const FEE_INCOME_ACCOUNT_NAME = '平台手续费收入账户';

/** 提现手续费收入流水类型。 */
export const FEE_TXN_TYPE = 'withdraw_fee';
