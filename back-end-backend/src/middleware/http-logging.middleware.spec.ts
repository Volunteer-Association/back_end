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

  beforeEach(async () => {
    logDirectory = await mkdtemp(join(tmpdir(), 'http-logging-'));
    middleware = new HttpLoggingMiddleware(logDirectory);
    responseEvents = new EventEmitter();
    statusCode = 200;
    setHeader = jest.fn();
    next = jest.fn();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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

    responseEvents = new EventEmitter();
    middleware.use(
      { method: 'POST', path: '/resource', ip: '127.0.0.1' } as Request,
      response(),
      next as unknown as NextFunction,
    );
    statusCode = 500;
    responseEvents.emit('finish');
    expect(error).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
