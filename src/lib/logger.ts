import pino, { type Logger } from 'pino';

export interface LoggerConfig {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel?: string;
}

export function createLogger(cfg: LoggerConfig): Logger {
  const defaultLevel =
    cfg.logLevel ||
    (cfg.nodeEnv === 'production' ? 'info' : cfg.nodeEnv === 'test' ? 'silent' : 'debug');

  const baseOptions: pino.LoggerOptions = {
    level: defaultLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.password_hash',
        '*.confirm_password',
        '*.csrfToken',
        '*._csrf',
        '*.sessionSecret',
        'password',
        'password_hash',
        'confirm_password',
        'csrfToken',
        '_csrf',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (cfg.nodeEnv === 'development') {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(baseOptions);
}
