import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from '../users/users.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { UpdateProfileDto } from '../users/dto/update-profile.dto.js';
import { AuthResponseHelper } from './auth-response.helper.js';
import { authenticatedUserId } from '../../common/http.util.js';

@ApiTags('认证与用户')
@Controller()
/** 当前登录用户的个人资料读写接口。 */
export class ProfileController {
  constructor(
    private readonly usersService: UsersService,
    private readonly helper: AuthResponseHelper,
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
    const profile = await this.usersService.findProfile(
      authenticatedUserId(request.user),
    );
    if (!profile) throw new NotFoundException('用户资料不存在');
    return profile;
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
      dto.mobile === undefined &&
      dto.sex === undefined
    ) {
      throw new BadRequestException('请至少提交一项要修改的资料');
    }
    const userId = authenticatedUserId(request.user);
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (!credentials) throw new NotFoundException('当前账号不存在');
    const profile = await this.usersService.updateProfile(
      userId,
      credentials.username,
      dto,
    );
    if (!profile) throw new NotFoundException('用户资料不存在');
    await this.helper.audit(request, 'info', 'profile_updated', userId);
    return profile;
  }
}
