import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import {
  AdminUsersService,
  type AdminSetStatus,
  type AllowedRoleKey,
} from './admin-users.service.js';

class CreateUserDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, { message: '用户名需为 3-30 位字母/数字/下划线' })
  username!: string;

  @IsString()
  @Length(8, 72, { message: '密码长度需在 8-72 位之间' })
  password!: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'banned'])
  status?: AdminSetStatus;

  @IsOptional()
  @IsArray()
  roleKeys?: AllowedRoleKey[];
}

class SetStatusDto {
  @IsIn(['active', 'inactive', 'banned'])
  status!: AdminSetStatus;
}

class AssignRolesDto {
  @IsArray()
  roleKeys!: AllowedRoleKey[];
}

class ResetPasswordDto {
  @IsString()
  @Length(8, 72, { message: '密码长度需在 8-72 位之间' })
  newPassword!: string;
}

@ApiTags('用户管理-超管')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  /** 只允许 super_admin；日常业务管理员（admin）无权进入这里。 */
  private requireSuperAdmin(req: Request & { user?: { sub: string; roles?: string[] } }) {
    if (!req.user || !req.user.roles?.includes('super_admin')) {
      throw new ForbiddenException('仅超级管理员可执行用户管理操作');
    }
  }

  @Get()
  @ApiOperation({ summary: '分页查询用户（仅超管）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'banned'] })
  @ApiQuery({ name: 'role', required: false, enum: ['user', 'admin', 'super_admin'] })
  list(
    @Req() req: Request & { user?: { sub: string; role: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: AdminSetStatus,
    @Query('role') role?: AllowedRoleKey,
  ) {
    this.requireSuperAdmin(req);
    return this.adminUsers.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      keyword,
      status,
      role,
    });
  }

  @Get('options')
  @ApiOperation({ summary: '用户管理下拉选项（状态、角色枚举，仅超管）' })
  options(@Req() req: Request & { user?: { sub: string; role: string } }) {
    this.requireSuperAdmin(req);
    return this.adminUsers.options();
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情（仅超管）' })
  detail(
    @Req() req: Request & { user?: { sub: string; role: string } },
    @Param('id') id: string,
  ) {
    this.requireSuperAdmin(req);
    return this.adminUsers.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '创建用户（仅超管）' })
  create(
    @Req() req: Request & { user?: { sub: string; role: string } },
    @Body() body: CreateUserDto,
  ) {
    this.requireSuperAdmin(req);
    return this.adminUsers.create(body, req.user!.sub);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '修改账号状态（仅超管，不能改自己）' })
  setStatus(
    @Req() req: Request & { user?: { sub: string; role: string } },
    @Param('id') id: string,
    @Body() body: SetStatusDto,
  ) {
    this.requireSuperAdmin(req);
    return this.adminUsers.setStatus(id, body.status, req.user!.sub);
  }

  @Patch(':id/roles')
  @ApiOperation({ summary: '分配角色（仅超管，不能改自己）' })
  assignRoles(
    @Req() req: Request & { user?: { sub: string; role: string } },
    @Param('id') id: string,
    @Body() body: AssignRolesDto,
  ) {
    this.requireSuperAdmin(req);
    return this.adminUsers.assignRoles(id, body.roleKeys, req.user!.sub);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: '重置用户密码（仅超管，重置后强制下线）' })
  resetPassword(
    @Req() req: Request & { user?: { sub: string; role: string } },
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
  ) {
    this.requireSuperAdmin(req);
    return this.adminUsers.resetPassword(id, body.newPassword, req.user!.sub);
  }
}
