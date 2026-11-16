import { ConsoleLogger, Logger, type LoggerService } from "@nestjs/common";

/**
 * Les erreurs et avertissements journalisés, retenus au lieu d'être écrits :
 * `capture` pose le logger pour un test, `release` rend celui par défaut. Pour
 * éprouver une promesse « rangé autrement ET journalisé ».
 */
export class CapturedLogs implements LoggerService {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  static capture(): CapturedLogs {
    const captured = new CapturedLogs();
    Logger.overrideLogger(captured);
    return captured;
  }

  release(): void {
    Logger.overrideLogger(new ConsoleLogger());
  }

  log(): void {}
  error(message: unknown): void {
    this.errors.push(String(message));
  }
  warn(message: unknown): void {
    this.warnings.push(String(message));
  }
}
