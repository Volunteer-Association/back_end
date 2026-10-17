import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from '../users/users.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { UpdateProfileDto } from '../users/dto/update-profile.dto.js';
import { AuthResponseHelper } from './auth-response.helper.js';
import { authenticatedUserId } from '../../common/http.util.js';
import { RegistrationService } from './registration.service.js';
import { DataSource } from 'typeorm';

const AVATAR_DIR = join(process.cwd(), 'public', 'avatars');
mkdirSync(AVATAR_DIR, { recursive: true });

@ApiTags('认证与用户')
@Controller()
/** 当前登录用户的个人资料读写接口。 */
export class ProfileController {
  constructor(
    private readonly usersService: UsersService,
    private readonly helper: AuthResponseHelper,
    private readonly registration: RegistrationService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('auth/profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取当前用户资料',
    description: '使用 Access Token 查询当前登录用户在 users 详情表中的资料。',
  })
  @ApiResponse({
    status: 200,
    description: '用户详情；邮箱和头像为只读字段。',
    schema: {
      example: {
        email: 'user@example.com',
        nickname: '小明',
        avatar: 'https://example.com/avatar.png',
        mobile: '13800138000',
        sex: 2,
      },
    },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 404, description: '用户详情不存在。' })
  async getProfile(@Req() request: Request & { user?: unknown }) {
    const userId = authenticatedUserId(request.user);
    const [profile, authState, account] = await Promise.all([
      this.usersService.findProfile(userId),
      this.usersService.findAuthenticationState(userId),
      this.usersService.findLocalCredentials(userId),
    ]);
    if (!profile) throw new NotFoundException('用户资料不存在');
    // 连表返回完整信息：资料 + 账号信息（username/userId/roles/createdAt）
    return {
      ...profile,
      id: userId,
      username: account?.username ?? '',
      roles: authState?.roles ?? [],
      role: authState?.role ?? 'user',
    };
  }

  @Get('auth/profile/options')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '个人资料相关枚举（证件类型从数据字典查询，可在字典管理维护）' })
  async profileOptions() {
    // 直接查 dict_items，避免引入 DictModule 循环依赖
    const rows = await this.dataSource.query(
      `SELECT dict_key, item_value FROM dict_items WHERE dict_type = 'id_type' AND enabled = 1 ORDER BY sort_order ASC, created_at ASC`,
    );
    return {
      idTypes: (rows as { dict_key: string; item_value: string }[]).map((r) => ({
        value: Number(r.dict_key),
        label: r.item_value,
      })),
    };
  }

  @Post('auth/profile/email-code')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发送修改邮箱验证码到新邮箱' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
  })
  async sendEmailCode(
    @Body() body: { email?: string },
    @Req() request: Request & { user?: unknown },
  ) {
    if (!body?.email) throw new BadRequestException('请输入新邮箱');
    const userId = authenticatedUserId(request.user);
    const cooldown = await this.registration.sendChangeEmailCode(body.email, userId);
    return { cooldownSeconds: cooldown };
  }

  @Patch('auth/profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '修改当前用户资料',
    description:
      '只修改请求中提供的用户资料字段；操作人及操作人 ID 由服务端依据登录会话写入。邮箱不能在此接口修改。',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: '修改后的用户资料。',
    schema: {
      example: {
        email: 'user@example.com',
        nickname: '小明',
        avatar: 'https://example.com/avatar.png',
        mobile: '13800138000',
        sex: 2,
      },
    },
  })
  @ApiResponse({ status: 400, description: '未提交可修改字段或字段值无效。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 404, description: '用户详情不存在。' })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() request: Request & { user?: unknown },
  ) {
    if (
      dto.nickname === undefined &&
      dto.email === undefined &&
      dto.mobile === undefined &&
      dto.sex === undefined &&
      dto.avatar === undefined &&
      dto.idType === undefined &&
      dto.idNumber === undefined &&
      dto.address === undefined
    ) {
      throw new BadRequestException('请至少提交一项要修改的资料');
    }
    const userId = authenticatedUserId(request.user);
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (!credentials) throw new NotFoundException('当前账号不存在');

    // 如果要改邮箱，必须带邮箱验证码
    if (dto.email) {
      if (!dto.emailCode) {
        throw new BadRequestException('修改邮箱需要填写邮箱验证码');
      }
      await this.registration.verifyChangeEmailCode(dto.email, dto.emailCode);
    }

    // emailCode 不是数据库字段，不能传给 update
    const { emailCode: _ignored, ...profileChanges } = dto;

    // 如果传了证件类型，同步查字典中文名冗余到 id_type_label
    if (dto.idType !== undefined) {
      if (dto.idType === null) {
        (profileChanges as Record<string, unknown>).idTypeLabel = null;
      } else {
        const rows = await this.dataSource.query(
          `SELECT item_value FROM dict_items WHERE dict_type = 'id_type' AND dict_key = ? AND enabled = 1 LIMIT 1`,
          [String(dto.idType)],
        );
        const row = rows as { item_value: string }[];
        (profileChanges as Record<string, unknown>).idTypeLabel = row[0]?.item_value ?? null;
      }
    }

    const profile = await this.usersService.updateProfile(
      userId,
      credentials.username,
      profileChanges,
    );
    if (!profile) throw new NotFoundException('用户资料不存在');
    await this.helper.audit(request, 'info', 'profile_updated', userId);
    return profile;
  }

  @Post('auth/kyc/submit')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交实名认证申请（真实姓名+证件号），进入管理员审核队列' })
  async submitKyc(
    @Body() body: { realName: string; idNumber: string },
    @Req() request: Request & { user?: unknown },
  ) {
    const userId = authenticatedUserId(request.user);
    if (!body?.realName?.trim() || !body?.idNumber?.trim()) {
      throw new BadRequestException('请填写真实姓名和证件号码');
    }
    const result = await this.dataSource.query(
      `SELECT verify_status, real_name, id_number FROM users WHERE user_id = ?`,
      [userId],
    );
    const row = (result as any[])[0];
    if (!row) throw new NotFoundException('用户资料不存在');
    if (row.verify_status === 2) throw new BadRequestException('已完成实名认证，无需重复提交');
    if (row.verify_status === 1) throw new BadRequestException('实名审核中，请耐心等待');
    await this.dataSource.query(
      `UPDATE users SET real_name = ?, id_number = ?, verify_status = 1, verify_reject_reason = NULL WHERE user_id = ?`,
      [body.realName.trim(), body.idNumber.trim(), userId],
    );
    return { ok: true, message: '实名申请已提交，请等待管理员审核' };
  }

  @Get('auth/kyc/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询当前用户实名状态' })
  async kycStatus(@Req() request: Request & { user?: unknown }) {
    const userId = authenticatedUserId(request.user);
    const rows = await this.dataSource.query(
      `SELECT verify_status, real_name, verified_at, verify_reject_reason, id_number, id_type_label FROM users WHERE user_id = ?`,
      [userId],
    );
    const r = (rows as any[])[0] ?? {};
    return {
      status: r.verify_status ?? 0,
      realName: r.real_name ?? null,
      verifiedAt: r.verified_at ?? null,
      rejectReason: r.verify_reject_reason ?? null,
      idNumber: r.id_number ?? null,
      idTypeLabel: r.id_type_label ?? null,
    };
  }

  @Post('auth/avatar')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '上传头像',
    description: '上传 jpg/png/gif/webp 图片（≤2MB），返回可用于 PATCH /auth/profile 的头像 URL。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: '上传成功。' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATAR_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomBytes(16).toString('hex')}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname);
        if (!ok) return cb(new BadRequestException('仅支持 jpg/png/gif/webp 图片'), false);
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request & { user?: unknown },
  ) {
    if (!file) throw new BadRequestException('请选择要上传的头像图片');
    const userId = authenticatedUserId(request.user);
    const url = `/static/file/avatars/${file.filename}`;
    // 上传即更新到当前用户资料
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (credentials) {
      await this.usersService.updateProfile(userId, credentials.username, { avatar: url });
    }
    await this.helper.audit(request, 'info', 'avatar_uploaded', userId);
    return { url };
  }
}
