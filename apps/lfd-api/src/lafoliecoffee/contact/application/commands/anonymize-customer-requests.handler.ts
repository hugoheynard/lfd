import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { customerRequestKeptSince } from "../../domain/contact-retention.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { CustomerRequestRetention } from "../../domain/ports/customer-request.retention.js";
import { RequestPhotoStore } from "../../domain/ports/request-photo.store.js";
import { AnonymizeCustomerRequestsCommand } from "./anonymize-customer-requests.command.js";

/** Combien de demandes un lot touche : une requête courte, qui ne tient pas la table. */
export const CUSTOMER_REQUEST_ANONYMIZE_BATCH_SIZE = 200;

/**
 * L'anonymisation des demandes conservées depuis douze mois
 * (`demandes-clients.md`, §6.2 et §7). La frontière est
 * `customerRequestKeptSince`.
 *
 * Par l'agrégat, demande par demande : `anonymize` vide l'enveloppe et les
 * détails de son type, et rend les objets photo à SUPPRIMER. Ils le sont
 * AVANT l'enregistrement : si l'enregistrement échoue, le passage suivant
 * les redemande, et `delete` est idempotent ; dans l'ordre inverse, une
 * suppression ratée laisserait une photo que plus aucune ligne ne cite.
 *
 * @sans-journal un nettoyage déclenché par la machine : aucun acte de
 * personne. Le compte rendu est un nombre, jamais une donnée.
 */
@CommandHandler(AnonymizeCustomerRequestsCommand)
export class AnonymizeCustomerRequestsHandler implements ICommandHandler<
  AnonymizeCustomerRequestsCommand,
  number
> {
  constructor(
    private readonly retention: CustomerRequestRetention,
    private readonly requests: CustomerRequestRepository,
    private readonly photos: RequestPhotoStore,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const before = customerRequestKeptSince(now);
    let total = 0;
    for (;;) {
      const due = await this.retention.dueBefore(before, CUSTOMER_REQUEST_ANONYMIZE_BATCH_SIZE);
      for (const id of due) {
        total += (await this.anonymizeOne(id, now)) ? 1 : 0;
      }
      if (due.length < CUSTOMER_REQUEST_ANONYMIZE_BATCH_SIZE) {
        return total;
      }
    }
  }

  private async anonymizeOne(id: string, at: Date): Promise<boolean> {
    const request = await this.requests.load(id);
    if (request === null) {
      return false;
    }
    const purge = request.anonymize(at);
    for (const key of purge) {
      await this.photos.delete(key);
    }
    await this.requests.save(request);
    return true;
  }
}
