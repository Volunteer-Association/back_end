import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { HttpLoggingMiddleware } from './http-logging.middleware.js';

describe('HttpLoggingMiddleware', () => {
  let middleware: HttpLoggingMiddleware;
  let responseEvents: EventEmitter;
  let statusCode: number;
  let logDirectory: string;
  let setHeader: jest.Mock;
  let next: jest.Mock;
  const loggingService = {
    audit: jest.fn(),
  };

  beforeEach(async () => {
    logDirectory = await mkdtemp(join(tmpdir(), 'http-logging-'));
    middleware = new HttpLoggingMiddleware(logDirectory, loggingService);
    responseEvents = new EventEmitter();
    statusCode = 200;
    setHeader = jest.fn();
    next = jest.fn();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await rm(logDirectory, { recursive: true, force: true });
  });

  function response(): Response {
    return {
      setHeader,
      on: responseEvents.on.bind(responseEvents),
      get statusCode() {
        return statusCode;
      },
    } as unknown as Response;
  }

  it('logs request metadata without query-string contents', async () => {
    const logger = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const request = {
      method: 'GET',
      path: '/users',
      originalUrl: '/users?access_token=secret',
      ip: '127.0.0.1',
    } as Request;
    middleware.use(request, response(), next as unknown as NextFunction);

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(next).toHaveBeenCalledTimes(1);
    responseEvents.emit('finish');

    const logged = String(logger.mock.calls[0][0]);
    const loggedEntry = JSON.parse(logged) as {
      level: string;
      message: string;
    };
    expect(Object.keys(JSON.parse(logged) as Record<string, unknown>).at(-1)).toBe(
      'timestamp',
    );
    expect(loggedEntry.level).toBe('info');
    expect(loggedEntry.message).toContain('HTTP GET /users returned 200');
    expect(logged).toContain('"path":"/users"');
    expect(logged).not.toContain('access_token');
    expect(logged).not.toContain('secret');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const file = await readFile(
      join(logDirectory, `http-${new Date().toISOString().slice(0, 10)}.log`),
      'utf8',
    );
    expect(file).toContain('"path":"/users"');
    expect(file).not.toContain('access_token');
    expect(file).not.toContain('secret');
  });

  it('uses warning and error levels for failed responses', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    middleware.use(
      { method: 'GET', path: '/resource', ip: '127.0.0.1' } as Request,
      response(),
      next as unknown as NextFunction,
    );

    statusCode = 404;
    responseEvents.emit('finish');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(loggingService.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'warn',
        category: 'http',
        message: expect.stringContaining('returned 404'),
      }),
    );

    responseEvents = new EventEmitter();
    middleware.use(
      { method: 'POST', path: '/resource', ip: '127.0.0.1' } as Request,
      response(),
      next as unknown as NextFunction,
    );
    statusCode = 500;
    responseEvents.emit('finish');
    expect(error).toHaveBeenCalledTimes(1);
    expect(loggingService.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'error',
        category: 'http',
        message: expect.stringContaining('returned 500'),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const date = new Date().toISOString().slice(0, 10);
    const httpLog = await readFile(
      join(logDirectory, `http-${date}.log`),
      'utf8',
    );
    const errorLog = await readFile(
      join(logDirectory, `error-${date}.log`),
      'utf8',
    );
    const httpEntries = httpLog
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as {
        level: string;
        status: number;
        message: string;
        timestamp: string;
      });
    const errorEntries = errorLog
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as {
        level: string;
        status: number;
        message: string;
        timestamp: string;
      });
    expect(httpEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warn',
          status: 404,
          message: expect.stringContaining('HTTP GET /resource returned 404'),
        }),
        expect.objectContaining({
          level: 'error',
          status: 500,
          message: expect.stringContaining('HTTP POST /resource returned 500'),
        }),
      ]),
    );
    expect(errorEntries).toEqual([
      expect.objectContaining({
        level: 'error',
        status: 500,
        message: expect.stringContaining('HTTP POST /resource returned 500'),
      }),
    ]);
    expect(httpEntries.every((entry) => entry.timestamp)).toBe(true);
  });
});
