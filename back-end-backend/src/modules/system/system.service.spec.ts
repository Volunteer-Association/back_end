import { BadRequestException } from '@nestjs/common';
import { SystemService } from './system.service';

describe('SystemService', () => {
  const service = new SystemService({
    getOrThrow: () => ({}),
  } as never);

  it('returns a stable health greeting without external side effects', () => {
    expect(service.getHello()).toBe('Hello World!');
  });

  it('rejects uploads without files', async () => {
    await expect(service.uploadFile([])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
