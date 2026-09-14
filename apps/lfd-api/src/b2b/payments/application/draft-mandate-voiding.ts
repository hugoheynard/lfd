import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import type {
  DraftVoidingCause,
  MandateActorChannel,
} from "../domain/events/payment-mandate-facts.js";
import { MandateDraftVoidedEvent } from "../domain/events/payment-mandate.events.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";

/** Les ports de la révocation d'un brouillon devenu caduc. */
export interface DraftVoidingDeps {
  readonly mandates: PaymentMandateRepository;
  readonly clock: Clock;
  readonly events: DomainEventPublisher;
  readonly uow: UnitOfWork;
}

/** Ce qui rend le brouillon caduc, et qui l'a fait — les deux entrent au journal. */
export interface DraftVoidingTrigger {
  readonly cause: DraftVoidingCause;
  readonly via: MandateActorChannel;
}

/**
 * Écrit ce qui est imprimé sur le mandat — RIB ou zones 14/19 — et **révoque
 * le brouillon en cours dans la même unité de travail**.
 *
 * Plan `documentation/b2b/plan-mandat-client.md` §8 et §9 #4 (2026-09-14) :
 * **toute** écriture, même identique, tant qu'un brouillon existe. Le papier
 * imprime titulaire, adresse, IBAN, BIC et les deux zones ; un brouillon signé
 * après un changement nommerait un compte qui n'est plus le RIB. Comparer champ
 * à champ pour épargner une réécriture à l'identique ajouterait une règle à
 * tenir pour un cas qui ne coûte qu'une régénération.
 *
 * Un mandat **actif** n'est pas touché ici : côté client, le RIB est refusé en
 * amont ; côté staff, c'est une dette écrite (`todo-mandat-core-contre-b2b.md`).
 *
 * `write` s'exécute DANS l'unité de travail : un fait qu'il publie partage la
 * transaction de l'écriture (c'est ce que fait l'écriture des zones 14/19).
 *
 * @returns le brouillon révoqué, ou `null` — pour prévenir l'équipe HORS de la
 *   transaction, une cloche en panne ne devant jamais annuler l'écriture.
 */
export async function writeVoidingDraft(
  deps: DraftVoidingDeps,
  companyId: string,
  trigger: DraftVoidingTrigger,
  write: () => Promise<void>,
): Promise<PaymentMandate | null> {
  const draft = await deps.mandates.findDraft(companyId);
  // L'agrégat refuse la transition AVANT toute écriture : révoquer d'abord en
  // mémoire, écrire ensuite.
  draft?.revoke(deps.clock.now());
  await deps.uow.run(async () => {
    await write();
    if (draft !== null) {
      await deps.mandates.save(draft);
      await deps.events.publishTraced(
        new MandateDraftVoidedEvent(
          draft.id,
          companyId,
          draft.reference,
          trigger.cause,
          trigger.via,
        ),
      );
    }
  });
  return draft;
}
