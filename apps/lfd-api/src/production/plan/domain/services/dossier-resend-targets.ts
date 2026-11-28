import {
  DossierRecipientUpToDateError,
  DossierResendRecipientUnknownError,
} from "../errors/dossier-resend-errors.js";
import type { DossierDispatchTrace } from "../ports/dossier-dispatches.reader.js";
import type { DossierAddressee } from "./dossier-addressees.js";

/** À qui renvoyer : une ligne de la liste, ou tous ceux qui ne sont pas à jour. */
export type DossierResendTarget =
  { readonly kind: "recipient"; readonly recipientId: string } | { readonly kind: "outdated" };

/** Ce qu'un destinataire a reçu de la journée en dernier : une version, ou `null`. */
export interface ReceivedVersion {
  readonly recipientId: string;
  /** `null` : un envoi d'avant les versions. */
  readonly planVersion: number | null;
}

/** Un destinataire à servir, et la version d'où part son résumé. */
export interface DossierResend {
  readonly addressee: DossierAddressee;
  /** La version reçue, ou 1 s'il n'en a reçu aucune (ou d'avant les versions). */
  readonly sinceVersion: number;
  readonly received: boolean;
}

/** La dernière version reçue de chacun, ou `undefined` : rien reçu. */
export type LastReceived = ReadonlyMap<string, ReceivedVersion>;

const FIRST_VERSION = 1;

function resendOf(addressee: DossierAddressee, last: LastReceived): DossierResend {
  const version = last.get(addressee.recipientId)?.planVersion ?? null;
  return version === null
    ? { addressee, sinceVersion: FIRST_VERSION, received: false }
    : { addressee, sinceVersion: version, received: true };
}

/** À jour : il a reçu la version courante (ou une plus récente, que rien ne produit). */
function isCurrent(resend: DossierResend, current: number): boolean {
  return resend.received && resend.sinceVersion >= current;
}

/**
 * **À qui renvoyer la version `current`** (`les-versions-du-plan.md`). « Pas à jour », comme l'écran le dit : une version reçue
 * antérieure, un envoi d'avant les versions, ou rien reçu de la journée.
 *
 * - une ligne visée qui n'est plus dans la liste servie est refusée (404) ;
 * - une ligne visée déjà à jour est refusée (409) : le geste ne renvoie pas
 *   pour rien ;
 * - « tous les dépassés » peut ne servir personne : ce n'est pas un refus.
 *
 * @throws {DossierResendRecipientUnknownError}
 * @throws {DossierRecipientUpToDateError}
 */
export function dossierResendsOf(
  target: DossierResendTarget,
  addressees: readonly DossierAddressee[],
  last: LastReceived,
  current: number,
): readonly DossierResend[] {
  if (target.kind === "outdated") {
    return addressees
      .map((addressee) => resendOf(addressee, last))
      .filter((resend) => !isCurrent(resend, current));
  }
  const addressee = addressees.find((one) => one.recipientId === target.recipientId);
  if (addressee === undefined) {
    throw new DossierResendRecipientUnknownError(target.recipientId);
  }
  const resend = resendOf(addressee, last);
  if (isCurrent(resend, current)) {
    throw new DossierRecipientUpToDateError(addressee.name, resend.sinceVersion);
  }
  return [resend];
}

/**
 * Reçu, ou en passe de l'être : un envoi accepté (`sent`), ou un renvoi
 * demandé à la boîte d'envoi (`requested`), qui part et se relance seul.
 */
export function isReceived(trace: DossierDispatchTrace): boolean {
  return trace.outcome === "sent" || trace.outcome === "requested";
}

/** La dernière version reçue de chaque ligne, lue sur les traces de la journée. */
export function lastReceivedOf(traces: readonly DossierDispatchTrace[]): LastReceived {
  const last = new Map<string, DossierDispatchTrace>();
  for (const trace of traces.filter(isReceived)) {
    const known = last.get(trace.recipientId);
    if (known === undefined || trace.claimedAt >= known.claimedAt) {
      last.set(trace.recipientId, trace);
    }
  }
  return new Map(
    [...last].map(([recipientId, trace]) => [
      recipientId,
      { recipientId, planVersion: trace.planVersion },
    ]),
  );
}
