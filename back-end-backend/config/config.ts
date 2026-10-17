import { registerAs } from '@nestjs/config';
import { resolve } from 'node:path';
type Environment = Record<string, string | undefined>;

/** Normalize an HTTP(S) origin while rejecting paths and other URL components. */
export function normalizeHttpOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('CORS_ORIGINS must contain valid HTTP(S) origins');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('CORS_ORIGINS must contain valid HTTP(S) origins');
  }
  return parsed.origin;
}

/** 读取非空环境变量；未设置或全为空白时使用默认值。 */
function value(
  env: Environment,
  key: string,
  fallback: string,
): string {
  const configured = env[key]?.trim();
  return configured || fallback;
}

function integer(
  env: Environment,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[key]?.trim();
  const parsed = raw ? Number(raw) : fallback;
  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

/** 在多个历史/标准变量名中按优先级选择并校验整数配置。 */
function integerFrom(
  env: Environment,
  keys: string[],
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const key = keys.find((candidate) => Boolean(env[candidate]?.trim()));
  return integer(env, key ?? keys[0], fallback, minimum, maximum);
}

/** 将 .env 键转换为业务配置对象，集中维护默认值和兼容别名。 */
export function createAppConfiguration(env: Environment = process.env) {
  const nodeEnv = value(env, 'NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const defaultCorsOrigins = isProduction
    ? []
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ];
  const corsOrigins = env.CORS_ORIGINS?.trim()
    ? env.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(normalizeHttpOrigin)
    : defaultCorsOrigins;
  const prefix = value(env, 'PREFIX', value(env, 'SERVER_BASE_URL', '/static/file'));

  if (!prefix.startsWith('/')) {
    throw new Error('PREFIX must start with "/"');
  }

  // 反代部署时设置为代理跳数（如 1）或子网，才能正确读取 request.ip；默认不信任代理头。
  const trustProxyRaw = value(env, 'TRUST_PROXY', 'false').toLowerCase();
  const trustProxy =
    trustProxyRaw === 'true'
      ? true
      : trustProxyRaw === 'false'
        ? false
        : trustProxyRaw;

  // 端口在 server.port 和 OAuth 回调默认地址中复用，只解析一次。
  const port = integerFrom(env, ['PORT', 'SERVER_PORT'], 3000, 1, 65535);

  return {
    nodeEnv,
    server: {
      host: value(env, 'SERVER_IP', '0.0.0.0'),
      port,
      staticPrefix: prefix,
      trustProxy,
      // 生产环境默认关闭 Swagger；设置 SWAGGER_ENABLED=true 可显式开启。
      swaggerEnabled:
        value(env, 'SWAGGER_ENABLED', isProduction ? 'false' : 'true').toLowerCase() === 'true',
    },
    corsOrigins,
    database: {
      type: 'mysql' as const,
      host: value(env, 'SQL_HOST', value(env, 'DB_HOST', 'localhost')),
      port: integerFrom(env, ['SQL_PORT', 'DB_PORT'], 3306, 1, 65535),
      username: value(
        env,
        'SQL_USERNAME',
        value(env, 'SQL_UESRNAME', value(env, 'DB_USERNAME', 'root')),
      ),
      password: value(env, 'SQL_PASSWORD', value(env, 'DB_PASSWORD', '')),
      name: value(env, 'SQL_DATABASE', value(env, 'DB_DATABASE', 'back_end')),
      timezone: value(env, 'SQL_TIMEZONE', value(env, 'DB_TIMEZONE', '+08:00')),
    },
    jwt: {
      secret: value(env, 'JWT_SECRET', ''),
    },
    snowflake: {
      workerId: integer(env, 'SNOWFLAKE_WORKER_ID', 0, 0, 1023),
    },
    logging: {
      directory: resolve(
        process.cwd(),
        value(env, 'LOG_DIR', 'logs'),
      ),
    },
    oauth: {
      frontendUrl: value(env, 'OAUTH_FRONTEND_URL', 'http://localhost:5173'),
      gitee: {
        clientId: value(env, 'GITEE_CLIENT_ID', ''),
        clientSecret: value(env, 'GITEE_CLIENT_SECRET', ''),
        callbackUrl: value(
          env,
          'GITEE_CALLBACK_URL',
          `http://localhost:${port}/auth/oauth/gitee/callback`,
        ),
      },
      github: {
        clientId: value(env, 'GITHUB_CLIENT_ID', ''),
        clientSecret: value(env, 'GITHUB_CLIENT_SECRET', ''),
        callbackUrl: value(
          env,
          'GITHUB_CALLBACK_URL',
          `http://localhost:${port}/auth/oauth/github/callback`,
        ),
      },
    },
    oss: {
      region: value(env, 'OSS_REGION', ''),
      accessKeyId: value(env, 'OSS_ACCESS_KEY_ID', ''),
      accessKeySecret: value(env, 'OSS_ACCESS_KEY_SECRET', ''),
      bucket: value(env, 'OSS_BUCKET', ''),
      authorizationV4: true,
    },
    upload: {
      // 单文件上限（字节），默认 500 KiB，与 interceptor 保持一致。
      maxSizeBytes: integer(
        env,
        'UPLOAD_MAX_SIZE',
        500 * 1024,
        1,
        100 * 1024 * 1024,
      ),
      // 单次请求最多上传文件数；超过则拒绝。
      maxCount: integer(env, 'UPLOAD_MAX_COUNT', 5, 1, 20),
      // 允许的小写扩展名白名单；逗号分隔，空表示不限制。
      allowedExtensions: value(env, 'UPLOAD_ALLOWED_EXTENSIONS', '')
        .split(',')
        .map((ext) => ext.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean),
    },
    email: {
      host: value(env, 'EMAIL_HOST', ''),
      port: integer(env, 'EMAIL_PORT', 465, 1, 65535),
      secure: value(env, 'EMAIL_SECURE', 'true').toLowerCase() === 'true',
      user: value(env, 'EMAIL_USER', ''),
      password: value(env, 'EMAIL_PASS', ''),
      from: value(env, 'EMAIL_FROM', value(env, 'EMAIL_USER', '')),
      verificationCooldown: integer(
        env,
        'EMAIL_VERIFICATION_COOLDOWN',
        60,
        30,
        3600,
      ),
      expires: integer(env, 'EMAIL_EXPIRES', 300000, 1, Number.MAX_SAFE_INTEGER),
    },
  };
}

export function validateEnvironment(env: Environment): Environment {
  const config = createAppConfiguration(env);

  if (!config.database.password) {
    throw new Error('SQL_PASSWORD is required');
  }
  if (!config.jwt.secret) {
    throw new Error('JWT_SECRET is required');
  }
  if (config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  const emailCredentials = [
    config.email.host,
    config.email.user,
    config.email.password,
  ];
  if (
    (emailCredentials.some(Boolean) || env.EMAIL_FROM?.trim()) &&
    !emailCredentials.every(Boolean)
  ) {
    throw new Error(
      'EMAIL_HOST, EMAIL_USER, and EMAIL_PASS must be configured together',
    );
  }
  for (const [provider, credentials] of Object.entries({
    GITEE: config.oauth.gitee,
    GITHUB: config.oauth.github,
  })) {
    if (Boolean(credentials.clientId) !== Boolean(credentials.clientSecret)) {
      throw new Error(`${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET must be configured together`);
    }
    if (credentials.clientId) {
      for (const [name, value] of [
        [`${provider}_CALLBACK_URL`, credentials.callbackUrl],
        ['OAUTH_FRONTEND_URL', config.oauth.frontendUrl],
      ]) {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          throw new Error(`${name} must be a valid HTTP(S) URL`);
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error(`${name} must use HTTP or HTTPS`);
        }
        if (config.nodeEnv === 'production' && parsed.protocol !== 'https:') {
          throw new Error(`${name} must use HTTPS in production`);
        }
      }
    }
  }
  if (config.nodeEnv === 'production') {
    const requiredKeys = [
      ['SQL_HOST', 'DB_HOST'],
      ['SQL_DATABASE', 'DB_DATABASE'],
      ['SQL_USERNAME', 'SQL_UESRNAME', 'DB_USERNAME'],
    ];
    for (const aliases of requiredKeys) {
      if (!aliases.some((key) => env[key]?.trim())) {
        throw new Error(`${aliases[0]} is required in production`);
      }
    }
    if (!env.SNOWFLAKE_WORKER_ID?.trim()) {
      throw new Error('SNOWFLAKE_WORKER_ID is required in production');
    }
  }

  return env;
}

/** 返回当前环境专属文件、兼容旧命名及通用 .env 的加载顺序。 */
export function getEnvironmentFilePaths(env: Environment = process.env): string[] {
  const nodeEnv = value(env, 'NODE_ENV', 'development');
  const legacyName =
    nodeEnv === 'production'
      ? '.env.prod'
      : nodeEnv === 'development'
        ? '.env.dev'
        : undefined;

  // 按优先级依次加载环境文件；dotenv 不覆盖进程中已设置的变量。
  return [
    resolve(process.cwd(), `.env.${nodeEnv}`),
    ...(legacyName ? [resolve(process.cwd(), legacyName)] : []),
    resolve(process.cwd(), '.env'),
  ];
}

export const appConfig = registerAs(
  'app',
  () => createAppConfiguration(),
);
