import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Parameter } from './dto/system.dto.js';
import { SystemService } from './system.service';

describe('SystemService', () => {
  const service = new SystemService({
    getOrThrow: () => ({}),
  } as never);

  it('returns a stable health greeting without external side effects', () => {
    expect(service.getHello()).toBe('Hello World!');
  });

  it('returns numeric memory values in the requested unit without host details', () => {
    const option = plainToInstance(Parameter, { memory: 'kb' });
    const result = service.getSystemResource(option);

    expect(result.memory.unit).toBe('KB');
    expect(result.memory.free).toEqual(expect.any(Number));
    expect(result.memory.used).toEqual(expect.any(Number));
    expect(result.memory.total).toEqual(expect.any(Number));
    expect(result.cpu.cores).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('userInfo');
    expect(result).not.toHaveProperty('homedir');
    expect(result).not.toHaveProperty('networkInterfaces');
  });

  it('defaults system memory values to megabytes', () => {
    expect(service.getSystemResource({}).memory.unit).toBe('MB');
  });

  it('rejects uploads without files', async () => {
    await expect(service.uploadFile([])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
