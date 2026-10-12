import { Injectable } from '@nestjs/common';
import { CreateDemoDto } from './dto/create-demo.dto.js';
import { UpdateDemoDto } from './dto/update-demo.dto.js';

@Injectable()
/** 演示 CRUD 的占位服务；目前不连接数据库，也不持久化任何资源。 */
export class DemoService {
  create(_createDemoDto: CreateDemoDto) {
    return 'This action adds a new demo';
  }

  findAll() {
    return `This action returns all demo`;
  }

  findOne(id: number) {
    return `This action returns a #${id} demo`;
  }

  update(id: number, _updateDemoDto: UpdateDemoDto) {
    return `This action updates a #${id} demo`;
  }

  remove(id: number) {
    return `This action removes a #${id} demo`;
  }
}
