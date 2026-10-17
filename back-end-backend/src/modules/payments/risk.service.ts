import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class RiskService {
  constructor(private readonly dataSource: DataSource) {}

  async getNum(key: string, fallback: number): Promise<number> {
    try {
      const rows = await this.dataSource.query(
        `SELECT config_value FROM risk_configs WHERE config_key = ?`,
        [key],
      );
      const v = (rows as any[])[0]?.config_value;
      return v ? Number(v) : fallback;
    } catch {
      return fallback;
    }
  }

  async getAll() {
    const rows = await this.dataSource.query(
      `SELECT config_key, config_value, description, updated_at FROM risk_configs ORDER BY id`,
    );
    return rows;
  }

  async setValue(key: string, value: string) {
    await this.dataSource.query(
      `INSERT INTO risk_configs (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?`,
      [key, value, value],
    );
  }

  /** 今日某用户某类型流水累计支出（分） */
  async todayOutflow(userId: string, types: string[]): Promise<number> {
    const placeholders = types.map(() => '?').join(',');
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM(-amount_cents), 0) AS total
       FROM balance_transactions
       WHERE user_id = ? AND amount_cents < 0 AND type IN (${placeholders})
         AND DATE(created_at) = CURDATE()`,
      [userId, ...types],
    );
    return Number((rows as any[])[0]?.total ?? 0);
  }
}
