const EPOCH = 1_704_067_200_000;
const SEQUENCE_BITS = 12n;
const WORKER_BITS = 10n;
const SEQUENCE_MASK = (1n << SEQUENCE_BITS) - 1n;
const MAX_TIMESTAMP = (1n << 41n) - 1n;
export const SNOWFLAKE_ID_GENERATOR = Symbol('SNOWFLAKE_ID_GENERATOR');

export class SnowflakeIdGenerator {
  private lastTimestamp: number;
  private sequence = 0n;

  constructor(
    private readonly workerId: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(workerId) || workerId < 0 || workerId > 1023) {
      throw new Error('Snowflake worker ID must be between 0 and 1023');
    }
    this.lastTimestamp = this.now();
    this.sequence = SEQUENCE_MASK;
  }

  async nextId(): Promise<string> {
    let timestamp = this.now();
    if (timestamp < this.lastTimestamp) {
      throw new Error('System clock moved backwards; cannot generate a Snowflake ID');
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & SEQUENCE_MASK;
      if (this.sequence === 0n) {
        do {
          await new Promise<void>((resolve) => setTimeout(resolve, 1));
          timestamp = this.now();
          if (timestamp < this.lastTimestamp) {
            throw new Error(
              'System clock moved backwards; cannot generate a Snowflake ID',
            );
          }
        } while (timestamp <= this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;
    const timestampPart = BigInt(timestamp - EPOCH);
    if (timestampPart < 0n || timestampPart > MAX_TIMESTAMP) {
      throw new Error('Current time is outside the supported Snowflake range');
    }

    return (
      (timestampPart << (WORKER_BITS + SEQUENCE_BITS)) |
      (BigInt(this.workerId) << SEQUENCE_BITS) |
      this.sequence
    ).toString();
  }
}
