import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ExportReaderKeyNotFoundError } from "../../domain/errors/export-reader-key-errors.js";
import { exportKeyRevokedFact } from "../../domain/events/export-reader-key-facts.js";
import { ExportReaderKeyRepository } from "../../domain/ports/export-reader-key.repository.js";
import { RevokeExportReaderKeyCommand } from "./revoke-export-reader-key.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "reporting.revoke-export-key";

/**
 * Révoque une clé : la clé refuse une seconde révocation, le dépôt range
 * l'agrégat, et `export_key.revoked` part dans la même transaction. La garde
 * relit la base à chaque appel : la clé est morte dès l'appel suivant.
 */
@CommandHandler(RevokeExportReaderKeyCommand)
export class RevokeExportReaderKeyHandler implements ICommandHandler<
  RevokeExportReaderKeyCommand,
  void
> {
  constructor(
    private readonly keys: ExportReaderKeyRepository,
    private readonly clock: Clock,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {ExportReaderKeyNotFoundError} aucune clé sous cet id.
   * @throws {ExportReaderKeyAlreadyRevokedError} la clé l'est déjà (hors rejeu de la même intention).
   */
  execute(command: RevokeExportReaderKeyCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject("export-key", command.keyId),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const key = await this.keys.load(command.keyId);
          if (key === null) {
            throw new ExportReaderKeyNotFoundError(command.keyId);
          }
          key.revoke(this.clock.now(), command.staffUserId);
          await this.keys.save(key);
          await this.journal.append(exportKeyRevokedFact(key));
          await seal();
        }),
    );
  }
}
