import { Logger } from "@nestjs/common";

import type {
  StaffNotice,
  StaffNotifier,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import type { DraftVoidingCause } from "../domain/events/payment-mandate-facts.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";

/** Ce qu'il faut pour sonner : la cloche, le nom de la société, l'heure. */
export interface MandateBellDeps {
  readonly notifier: StaffNotifier;
  readonly mandates: PaymentMandateRepository;
  readonly clock: Clock;
}

const LOGGER = new Logger("MandateStaffBell");

const CAUSE_LINES: Readonly<Record<DraftVoidingCause, string>> = {
  bank_account_changed: "les coordonnées bancaires ont été réécrites",
  mandate_options_changed: "les zones facultatives du mandat ont été réécrites",
  mandate_scheme_changed:
    "l'entité émettrice a changé le schéma de ses mandats (CORE ou interentreprises)",
  mandate_defaults_changed:
    "l'entité émettrice a changé le type de paiement ou la description du contrat imprimés sur le mandat",
};

/** Ce que la cloche lit d'un brouillon révoqué : de quoi nommer la société et la RUM. */
export type VoidedDraft = Pick<PaymentMandate, "id" | "companyId" | "reference">;

/**
 * Le client a déposé son mandat signé : **sans cette cloche, la pièce dort**
 * (plan mandat client §2). Une clé par mandat : un second dépôt sur le même
 * brouillon ne sonne pas deux fois — la première annonce suffit à faire ouvrir
 * la fiche, qui montre la pièce la plus récente.
 */
export async function ringProofDeposited(
  deps: MandateBellDeps,
  mandate: PaymentMandate,
): Promise<void> {
  await ring(deps, mandate.companyId, (companyName) => ({
    kind: "payment_mandate.proof_attached",
    subject: `Mandat signé déposé — ${companyName}`,
    body: `Le client a déposé le scan du mandat ${mandate.reference}. À relire avant de l'activer.`,
    idempotencyKey: `notification:payment_mandate.proof_attached:${mandate.id}`,
  }));
}

/**
 * Un brouillon vient d'être révoqué parce que son papier ne dit plus vrai. Le
 * commercial qui l'a envoyé doit le savoir avant que le client ne rappelle
 * avec un exemplaire signé qui ne vaut plus rien.
 */
export async function ringDraftVoided(
  deps: MandateBellDeps,
  draft: VoidedDraft,
  cause: DraftVoidingCause,
): Promise<void> {
  await ring(deps, draft.companyId, (companyName) => ({
    kind: "payment_mandate.draft_voided",
    subject: `Mandat à refaire — ${companyName}`,
    body: `Le mandat ${draft.reference} est révoqué : ${CAUSE_LINES[cause]}. Un nouveau mandat est à générer.`,
    idempotencyKey: `notification:payment_mandate.draft_voided:${draft.id}`,
  }));
}

/**
 * Sonne, **sans jamais faire échouer le geste** : l'écriture est déjà faite et
 * tracée. Un échec se journalise et s'arrête là — c'est la règle des canaux
 * d'alerte (`DispatchAlertChannels`), pour la même raison.
 */
async function ring(
  deps: MandateBellDeps,
  companyId: string,
  compose: (companyName: string) => Omit<StaffNotice, "link" | "occurredAt">,
): Promise<void> {
  try {
    const holder = await deps.mandates.findHolder(companyId);
    await deps.notifier.notify([
      {
        ...compose(holder?.companyName ?? companyId),
        link: `/comptes-clients/${companyId}/informations`,
        occurredAt: deps.clock.now(),
      },
    ]);
  } catch (error) {
    LOGGER.error(`Notification de mandat non émise (société ${companyId})`, error);
  }
}
