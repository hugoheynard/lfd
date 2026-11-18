import type { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { Clock } from "../../../platform/time/clock.js";
import type {
  ChorusDeposit,
  ChorusDepositEntry,
  ChorusGesture,
} from "../domain/entities/chorus-deposit.js";
import { ChorusDepositInvoiceNotFoundError } from "../domain/errors/chorus-deposit-errors.js";
import { ChorusDepositNotedEvent } from "../domain/events/chorus-deposit.events.js";
import type { ChorusDepositRepository } from "../domain/ports/chorus-deposit.repository.js";
import { parisDayOf } from "../domain/services/collection-test-file.js";

/** Ce qu'un geste du dépôt Chorus appelle — les trois handlers partagent la mécanique. */
export interface ChorusGestureDeps {
  readonly deposits: ChorusDepositRepository;
  readonly authors: StaffAuthorDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly events: DomainEventPublisher;
  readonly uow: UnitOfWork;
}

/** Qui fait le geste, sur quelle facture, et le jour saisi. */
export interface ChorusGestureInput {
  readonly invoiceId: string;
  readonly occurredOn: string;
  readonly staffUserId: string;
}

/**
 * Charger le dépôt d'une facture, appeler la méthode de l'agrégat, écrire sa
 * ligne et son fait dans la même transaction. Le nom de l'auteur est figé à
 * l'écriture (`staff_name`) ; une fiche sans nom laisse `null`.
 *
 * @throws {ChorusDepositInvoiceNotFoundError} la pièce n'existe pas.
 * @throws les refus de l'agrégat `ChorusDeposit`.
 */
export async function noteChorusGesture(
  deps: ChorusGestureDeps,
  input: ChorusGestureInput,
  act: (deposit: ChorusDeposit, gesture: ChorusGesture) => ChorusDepositEntry,
): Promise<void> {
  const at = deps.clock.now();
  const staffName = (await deps.authors.identify([input.staffUserId])).nameOf(input.staffUserId);
  await deps.uow.run(async () => {
    const deposit = await deps.deposits.load(input.invoiceId);
    if (deposit === null) {
      throw new ChorusDepositInvoiceNotFoundError(input.invoiceId);
    }
    const entry = act(deposit, {
      entryId: deps.ids.next(),
      occurredOn: input.occurredOn,
      today: parisDayOf(at),
      staffId: input.staffUserId,
      staffName,
      at,
    });
    await deps.deposits.save(deposit);
    await deps.events.publishTraced(new ChorusDepositNotedEvent(deposit.invoice, entry));
  });
}
