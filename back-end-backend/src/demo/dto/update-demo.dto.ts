import { PartialType } from '@nestjs/swagger';
import { CreateDemoDto } from './create-demo.dto.js';

export class UpdateDemoDto extends PartialType(CreateDemoDto) {}
