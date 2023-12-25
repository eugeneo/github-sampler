import winston from "winston";

export function getLogger(name: string) {
  return winston.createLogger({
    level: "debug",
    format: winston.format.combine(
      winston.format.cli(),
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ),
    transports: [new winston.transports.Console()],
    defaultMeta: { name },
  });
}
