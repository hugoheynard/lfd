import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { contactMessageKeptSince } from "../../domain/contact-retention.js";
import { ContactMessageAnonymizer } from "../../domain/ports/contact-message.anonymizer.js";
import { AnonymizeHandledContactMessagesCommand } from "./anonymize-handled-contact-messages.command.js";

/** Combien de messages un lot touche : une requête courte, qui ne tient pas la table. */
export const CONTACT_ANONYMIZE_BATCH_SIZE = 500;

/**
 * L'anonymisation des messages traités depuis douze mois
 * (`nous-contacter.md`, §5.3). La frontière est `contactMessageKeptSince`.
 *
 * @sans-journal un nettoyage déclenché par la machine : aucun acte de
 * personne, et le fait du traitement reste au journal tel quel.
 *
 * Idempotent : un passage manqué est rattrapé au suivant, un passage rejoué ne
 * trouve plus rien. Le compte rendu est un nombre, jamais une donnée.
 */
@CommandHandler(AnonymizeHandledContactMessagesCommand)
export class AnonymizeHandledContactMessagesHandler implements ICommandHandler<
  AnonymizeHandledContactMessagesCommand,
  number
> {
  constructor(
    private readonly anonymizer: ContactMessageAnonymizer,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const before = contactMessageKeptSince(now);
    let total = 0;
    for (;;) {
      const count = await this.anonymizer.anonymizeBatchHandledBefore(
        before,
        now,
        CONTACT_ANONYMIZE_BATCH_SIZE,
      );
      total += count;
      if (count < CONTACT_ANONYMIZE_BATCH_SIZE) {
        return total;
      }
    }
  }
}
