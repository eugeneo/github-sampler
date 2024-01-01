import { createLogger, format, transports } from "winston";

export function getLogger(name: string) {
  return createLogger({
    level: "debug",
    format: format.combine(
      format.cli(),
      format.timestamp(),
      format.errors({ stack: true })
    ),
    transports: [
      new transports.Console({ debugStdout: true, stderrLevels: ["error"] }),
    ],
    defaultMeta: { name },
  });
}
