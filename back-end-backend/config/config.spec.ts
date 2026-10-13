import {
  createAppConfiguration,
  getEnvironmentFilePaths,
  normalizeHttpOrigin,
  validateEnvironment,
} from './config.js';

describe('application configuration', () => {
  it('maps the existing .env PORT, PREFIX, and SQL settings', () => {
    const config = createAppConfiguration({
      NODE_ENV: 'development',
      PORT: '3000',
      PREFIX: '/static/file',
      SQL_HOST: 'db.example.test',
      SQL_PORT: '3307',
      SQL_UESRNAME: 'legacy-user',
      SQL_PASSWORD: 'test-password',
      SQL_DATABASE: 'application',
      JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
    });

    expect(config.server).toEqual({
      host: '0.0.0.0',
      port: 3000,
      staticPrefix: '/static/file',
      trustProxy: false,
      swaggerEnabled: true,
    });
    expect(config.database).toMatchObject({
      host: 'db.example.test',
      port: 3307,
      username: 'legacy-user',
      password: 'test-password',
      name: 'application',
    });
  });

  it('uses the same default backend port as the frontend development proxy', () => {
    const config = createAppConfiguration({
      JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
    });
    expect(config.server.port).toBe(3000);
    expect(config.oauth.gitee.callbackUrl).toContain(':3000/');
    expect(config.oauth.github.callbackUrl).toContain(':3000/');
  });

  it('normalizes configured CORS origins and tolerates trailing slashes', () => {
    const config = createAppConfiguration({
      CORS_ORIGINS:
        ' https://app.example.test/ ,http://localhost:5173',
    });

    expect(config.corsOrigins).toEqual([
      'https://app.example.test',
      'http://localhost:5173',
    ]);
    expect(normalizeHttpOrigin('HTTPS://APP.EXAMPLE.TEST:443')).toBe(
      'https://app.example.test',
    );
  });

  it.each([
    'https://app.example.test/path',
    'javascript:alert(1)',
    'https://user:pass@app.example.test',
  ])('rejects a non-origin CORS entry: %s', (origin) => {
    expect(() => normalizeHttpOrigin(origin)).toThrow(
      'CORS_ORIGINS must contain valid HTTP(S) origins',
    );
  });

  it('uses a configurable directory for HTTP log files', () => {
    expect(
      createAppConfiguration({ LOG_DIR: 'var/app-logs' }).logging.directory,
    ).toMatch(/[\\/]var[\\/]app-logs$/);
  });

  it('prefers canonical SQL_USERNAME over the legacy typo', () => {
    const config = createAppConfiguration({
      SQL_USERNAME: 'canonical-user',
      SQL_UESRNAME: 'legacy-user',
    });
    expect(config.database.username).toBe('canonical-user');
  });

  it('validates the Snowflake worker ID and applies the development default', () => {
    expect(createAppConfiguration({}).snowflake.workerId).toBe(0);
    expect(
      createAppConfiguration({ SNOWFLAKE_WORKER_ID: '1023' }).snowflake
        .workerId,
    ).toBe(1023);
    expect(() =>
      createAppConfiguration({ SNOWFLAKE_WORKER_ID: '1024' }),
    ).toThrow('SNOWFLAKE_WORKER_ID must be an integer between 0 and 1023');
  });

  it('maps the configured third-party OAuth callbacks and frontend URL', () => {
    const config = createAppConfiguration({
      PORT: '3200',
      GITEE_CLIENT_ID: 'gitee-id',
      GITEE_CLIENT_SECRET: 'gitee-secret',
      GITEE_CALLBACK_URL: 'https://api.example.test/auth/oauth/gitee/callback',
      GITHUB_CLIENT_ID: 'github-id',
      GITHUB_CLIENT_SECRET: 'github-secret',
      GITHUB_CALLBACK_URL: 'https://api.example.test/auth/oauth/github/callback',
      OAUTH_FRONTEND_URL: 'https://app.example.test',
    });

    expect(config.oauth).toEqual({
      frontendUrl: 'https://app.example.test',
      gitee: {
        clientId: 'gitee-id',
        clientSecret: 'gitee-secret',
        callbackUrl: 'https://api.example.test/auth/oauth/gitee/callback',
      },
      github: {
        clientId: 'github-id',
        clientSecret: 'github-secret',
        callbackUrl: 'https://api.example.test/auth/oauth/github/callback',
      },
    });
  });

  it('rejects a provider client ID without its matching secret', () => {
    expect(() =>
      validateEnvironment({
        SQL_PASSWORD: 'configured',
        JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
        GITEE_CLIENT_ID: 'only-client-id',
      }),
    ).toThrow(
      'GITEE_CLIENT_ID and GITEE_CLIENT_SECRET must be configured together',
    );
  });

  it('loads environment-specific files before the shared .env', () => {
    expect(getEnvironmentFilePaths({ NODE_ENV: 'production' })).toEqual([
      expect.stringMatching(/\.env\.production$/),
      expect.stringMatching(/\.env\.prod$/),
      expect.stringMatching(/\.env$/),
    ]);
  });

  it('rejects missing database passwords and JWT secrets without exposing values', () => {
    expect(() =>
      validateEnvironment({
        SQL_HOST: 'localhost',
        SQL_DATABASE: 'application',
        SQL_USERNAME: 'app',
        JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
      }),
    ).toThrow('SQL_PASSWORD is required');

    expect(() =>
      validateEnvironment({
        SQL_HOST: 'localhost',
        SQL_DATABASE: 'application',
        SQL_USERNAME: 'app',
        SQL_PASSWORD: 'configured',
      }),
    ).toThrow('JWT_SECRET is required');
  });

  it('requires explicit database connection values in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        SQL_PASSWORD: 'configured',
        JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
      }),
    ).toThrow('SQL_HOST is required in production');
  });

  it('requires an explicit Snowflake worker ID in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        SQL_HOST: 'db.example.test',
        SQL_DATABASE: 'application',
        SQL_USERNAME: 'app',
        SQL_PASSWORD: 'configured',
        JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
      }),
    ).toThrow('SNOWFLAKE_WORKER_ID is required in production');
  });
});
