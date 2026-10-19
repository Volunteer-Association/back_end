import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { RiskService } from './risk.service.js';

@ApiTags('风控-管理员')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/risk-config')
export class AdminRiskController {
  constructor(private readonly risk: RiskService) {}

  @Get()
  @ApiOperation({ summary: '查看风控配置' })
  list() {
    return this.risk.getAll();
  }

  @Put()
  @ApiOperation({ summary: '修改风控配置' })
  async set(@Body() body: { configKey: string; configValue: string }) {
    await this.risk.setValue(body.configKey, body.configValue);
    return { success: true };
  }
}
