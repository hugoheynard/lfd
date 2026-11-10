import { ConsoleLogger, Logger, type LoggerService } from "@nestjs/common";

/**
 * Les avertissements que les abonnés journalisent, retenus au lieu d'être
 * écrits : `Logger.overrideLogger` le pose pour un test, `release` rend le
 * logger par défaut. Pour éprouver une promesse « écarté ET journalisé ».
 */
export class CapturedWarnings implements LoggerService {
  readonly warnings: string[] = [];

  static capture(): CapturedWarnings {
    const captured = new CapturedWarnings();
    Logger.overrideLogger(captured);
    return captured;
  }

  release(): void {
    Logger.overrideLogger(new ConsoleLogger());
  }

  log(): void {}
  error(): void {}
  warn(message: unknown): void {
    this.warnings.push(String(message));
  }
}
