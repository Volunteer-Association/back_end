import { BadRequestException } from '@nestjs/common';

export const BCRYPT_ROUNDS = 12;
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

/** bcrypt 只处理最多 72 字节；拒绝超长 UTF-8 输入以避免截断产生同密码碰撞。 */
export function assertBcryptPasswordLength(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new BadRequestException('密码不能超过 72 个 UTF-8 字节');
  }
}
