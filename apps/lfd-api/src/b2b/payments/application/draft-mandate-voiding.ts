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
import { purgeVoidedDraftProof, type ProofPurgeDeps } from "./mandate-proof-purge.js";
import { mandateCompanyOf } from "./mandate-journal-names.js";

/** Les ports de la révocation seule — sans la purge, qui n'appartient pas à la transaction. */
export interface DraftRevocationDeps {
  readonly mandates: PaymentMandateRepository;
  readonly clock: Clock;
  readonly events: DomainEventPublisher;
  readonly uow: UnitOfWork;
}

/**
 * Les ports de la révocation d'un brouillon devenu caduc, **purge comprise** :
 * {@link writeVoidingDraft} ouvre et valide sa propre unité de travail, il peut
 * donc détruire la pièce après.
 */
export interface DraftVoidingDeps extends DraftRevocationDeps, ProofPurgeDeps {}

/** Ce qui rend le brouillon caduc, et qui l'a fait — les deux entrent au journal. */
export interface DraftVoidingTrigger {
  readonly cause: DraftVoidingCause;
  readonly via: MandateActorChannel;
  /**
   * Le brouillon trouvé est-il concerné ? Absent = toujours. Sert à épargner un
   * brouillon dont le papier n'imprime pas ce qui change (zones 14/19 sous un
   * formulaire interentreprises, depuis le 2026-09-15).
   */
  readonly appliesTo?: (draft: PaymentMandate) => boolean;
}

/**
 * Écrit ce qui est imprimé sur le mandat — RIB ou zones 14/19 — et **révoque
 * le brouillon en cours dans la même unité de travail**.
 *
 * Plan `documentation/comptabilite/plan-mandat-client.md` §8 et §9 #4 (2026-09-14) :
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
 * ## La pièce du brouillon est purgée (depuis le 2026-09-15)
 *
 * Après la validation, jamais dedans : un objet supprimé ne revient pas si la
 * transaction tombe. La purge ne lève pas — le RIB est écrit, le dire refusé
 * serait faux (plan `documentation/comptabilite/plan-restes-du-mandat.md` §4).
 * ⚠️ Elle suppose que cette fonction ouvre la transaction la plus externe ;
 * ses deux appelants sont des handlers sans unité de travail propre (vérifié
 * le 2026-09-15 : `recordCompanyBankAccount`, `recordMandateOptions`).
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
  const found = await deps.mandates.findDraft(companyId);
  const draft = found !== null && (trigger.appliesTo?.(found) ?? true) ? found : null;
  // L'agrégat refuse la transition AVANT toute écriture : révoquer d'abord en
  // mémoire, écrire ensuite.
  draft?.revoke(deps.clock.now());
  await deps.uow.run(async () => {
    await write();
    if (draft !== null) {
      await recordVoided(deps, draft, trigger);
    }
  });
  if (draft !== null) {
    await purgeVoidedDraftProof(deps, draft);
  }
  return draft;
}

/**
 * Révoque **plusieurs** brouillons d'un coup — ceux d'une entité émettrice dont
 * un réglage imprimé vient de changer (plan
 * `documentation/comptabilite/plan-mandat-deux-schemas.md` §10.4).
 *
 * Même séquence que {@link writeVoidingDraft}, sans écriture propre : l'appelant
 * est déjà dans l'unité de travail de son réglage, que celle-ci **rejoint**. Tous
 * sont révoqués en mémoire avant la première écriture — un refus de l'agrégat
 * n'en laisse aucun à moitié.
 *
 * 🔴 **Ne purge rien**, et c'est la différence avec {@link writeVoidingDraft} :
 * la transaction n'est pas la sienne, elle n'est pas validée quand cette
 * fonction rend. La purge part de l'annonce qui suit la transaction de
 * l'appelant (plan `plan-restes-du-mandat.md` §7 #10).
 *
 * @returns les brouillons révoqués, dont l'appelant purgera les pièces une
 *   fois sa transaction validée.
 */
export async function voidDrafts(
  deps: DraftRevocationDeps,
  drafts: readonly PaymentMandate[],
  trigger: DraftVoidingTrigger,
): Promise<readonly PaymentMandate[]> {
  if (drafts.length === 0) {
    return drafts;
  }
  const now = deps.clock.now();
  for (const draft of drafts) {
    draft.revoke(now);
  }
  await deps.uow.run(async () => {
    for (const draft of drafts) {
      await recordVoided(deps, draft, trigger);
    }
  });
  return drafts;
}

async function recordVoided(
  deps: DraftRevocationDeps,
  draft: PaymentMandate,
  trigger: DraftVoidingTrigger,
): Promise<void> {
  await deps.mandates.save(draft);
  await deps.events.publishTraced(
    new MandateDraftVoidedEvent(
      draft.id,
      await mandateCompanyOf(deps.mandates, draft.companyId),
      draft.reference,
      trigger.cause,
      trigger.via,
    ),
  );
}
