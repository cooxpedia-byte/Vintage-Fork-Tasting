type LogContext = Record<string, unknown>;

function write(level: "info" | "warn" | "error", message: string, context: LogContext = {}) {
  const payload = JSON.stringify({ level, message, context, timestamp: new Date().toISOString() });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, error?: unknown, context: LogContext = {}) => write("error", message, {
    ...context,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
  })
};
