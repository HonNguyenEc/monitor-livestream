import { Logger } from '@nestjs/common';

import {
  FATAL_EXIT_CODE,
  FATAL_LOG_CONTEXT,
  UNCAUGHT_EXCEPTION_MESSAGE,
  UNHANDLED_REJECTION_MESSAGE,
} from '../constants/app.constants';
import { logFatalErrors } from './fatal-errors';

type FatalEvent = 'uncaughtException' | 'unhandledRejection';
type Listener = (error: unknown) => void;

const FATAL_EVENTS: FatalEvent[] = ['uncaughtException', 'unhandledRejection'];
const emitter: NodeJS.EventEmitter = process;

describe('logFatalErrors', () => {
  let logError: jest.SpyInstance;
  let exit: jest.SpyInstance;
  let added: Map<FatalEvent, Listener>;

  beforeEach(() => {
    logError = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const before = new Map(FATAL_EVENTS.map((event) => [event, emitter.listeners(event)]));
    logFatalErrors();
    added = new Map(
      FATAL_EVENTS.map((event) => [
        event,
        emitter
          .listeners(event)
          .find((listener) => !before.get(event)?.includes(listener)) as Listener,
      ]),
    );
  });

  afterEach(() => {
    added.forEach((listener, event) => emitter.off(event, listener));
    jest.restoreAllMocks();
  });

  it('logs an uncaught exception with its stack, then exits with an error code', () => {
    const error = new Error('boom');

    added.get('uncaughtException')?.(error);

    expect(logError).toHaveBeenCalledWith(
      UNCAUGHT_EXCEPTION_MESSAGE,
      error.stack,
      FATAL_LOG_CONTEXT,
    );
    expect(exit).toHaveBeenCalledWith(FATAL_EXIT_CODE);
  });

  it('logs an unhandled rejection that is not an Error, then exits with an error code', () => {
    added.get('unhandledRejection')?.('plain reason');

    expect(logError).toHaveBeenCalledWith(
      UNHANDLED_REJECTION_MESSAGE,
      'plain reason',
      FATAL_LOG_CONTEXT,
    );
    expect(exit).toHaveBeenCalledWith(FATAL_EXIT_CODE);
  });
});
