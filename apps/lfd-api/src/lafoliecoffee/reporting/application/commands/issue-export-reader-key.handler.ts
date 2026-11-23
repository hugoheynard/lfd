import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { shownOnceReplay } from "../../../../platform/intent/shown-once-replay.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ExportReaderKey } from "../../domain/entities/export-reader-key.js";
import { ExportReaderKeySecretAlreadyShownError } from "../../domain/errors/export-reader-key-errors.js";
import { exportKeyCreatedFact } from "../../domain/events/export-reader-key-facts.js";
import { ExportKeySecretSource } from "../../domain/ports/export-key-secret-source.js";
import { ExportReaderKeyRepository } from "../../domain/ports/export-reader-key.repository.js";
import {
  IssueExportReaderKeyCommand,
  type IssuedExportReaderKey,
} from "./issue-export-reader-key.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "reporting.issue-export-key";

/**
 * Le registre des intentions ne garde que l'id : le secret en clair n'est
 * écrit nulle part, pas même là. Un rejeu ne recrée rien et reçoit un 409 qui
 * dit quoi faire.
 */
const ISSUED_KEY_REPLAY = shownOnceReplay<IssuedExportReaderKey>(
  (issued) => ({ id: issued.id }),
  () => new ExportReaderKeySecretAlreadyShownError(),
);

/**
 * Crée une clé de lecture de l'export : le secret est tiré, haché par la clé,
 * rangé avec le fait `export_key.created` dans la même transaction, puis rendu
 * en clair une seule fois.
 */
@CommandHandler(IssueExportReaderKeyCommand)
export class IssueExportReaderKeyHandler implements ICommandHandler<
  IssueExportReaderKeyCommand,
  IssuedExportReaderKey
> {
  constructor(
    private readonly keys: ExportReaderKeyRepository,
    private readonly secrets: ExportKeySecretSource,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : un double clic n'en crée pas une seconde.
   *
   * @throws {ExportReaderKeyLabelInvalidError} lecteur vide ou trop long.
   * @throws {ExportReaderKeyExpiryInPastError} échéance qui n'est pas à venir.
   * @throws {ExportReaderKeyIpInvalidError} une adresse admise illisible.
   * @throws {ExportReaderKeySecretAlreadyShownError} la même intention est rejouée.
   * @throws {GestureInFlightError} la même clé d'intention est encore en vol.
   * @throws {IntentKeyReusedError} la clé d'intention a servi pour autre chose.
   */
  execute(command: IssueExportReaderKeyCommand): Promise<IssuedExportReaderKey> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject("export-key", command.payload),
      },
      ISSUED_KEY_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const secret = this.secrets.next();
          const key = ExportReaderKey.issue({
            id: this.ids.next(),
            label: command.payload.label,
            secret,
            at: this.clock.now(),
            byStaffId: command.staffUserId,
            expiresAt: new Date(command.payload.expiresAt),
            allowedIps: command.payload.allowedIps,
          });
          await this.keys.save(key);
          await this.journal.append(exportKeyCreatedFact(key));
          const issued = { id: key.id, secret };
          await seal(issued);
          return issued;
        }),
    );
  }
}
