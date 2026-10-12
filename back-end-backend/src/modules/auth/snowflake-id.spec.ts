import { SnowflakeIdGenerator } from '../../../mysql/snowflake-id.js';

describe('SnowflakeIdGenerator', () => {
  it('generates unique decimal string IDs without losing 64-bit precision', async () => {
    let timestamp = 1_800_000_000_000;
    const generator = new SnowflakeIdGenerator(12, () => timestamp);
    timestamp += 1;

    const ids = await Promise.all([
      generator.nextId(),
      generator.nextId(),
      generator.nextId(),
    ]);

    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^\d{18,19}$/.test(id))).toBe(true);
    expect((BigInt(ids[0]) >> 12n) & 1023n).toBe(12n);
  });

  it('rejects clock rollback rather than risking duplicate IDs', async () => {
    let timestamp = 1_800_000_000_000;
    const generator = new SnowflakeIdGenerator(1, () => timestamp);
    timestamp += 1;
    await generator.nextId();
    timestamp -= 2;

    await expect(generator.nextId()).rejects.toThrow(
      'System clock moved backwards',
    );
  });

  it('validates worker IDs', () => {
    expect(() => new SnowflakeIdGenerator(1024)).toThrow(
      'Snowflake worker ID must be between 0 and 1023',
    );
  });
});
