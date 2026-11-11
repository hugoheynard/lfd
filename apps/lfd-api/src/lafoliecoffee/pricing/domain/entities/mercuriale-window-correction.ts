import {
  AmendmentOutsideCorrectedWindowError,
  MercurialeAlreadyStartedError,
  MissingWindowCorrectionReasonError,
  PastCorrectedStartError,
  PausedMercurialeWindowError,
  ReversedValidityWindowError,
} from "../pricing-errors.js";
import type { CompanyMercurialeState } from "./company-mercuriale-state.js";
import type { MercurialeAmendment } from "./mercuriale-amendment.js";

/*
 * **Corriger les dates d'une mercuriale** qui n'a pas commencé
 * (`documentation/pricing/mercuriales/comprendre-une-mercuriale.md`, § 9, C1 à C4).
 *
 * « À venir » est la frontière : une commande est tarifée à son instant de
 * passation, et une mercuriale à venir ne couvre aucun instant passé ni
 * présent — aucune commande ne peut l'avoir citée. La close est refusée par
 * l'agrégat avant d'arriver ici.
 */

/** Le jour civil à Paris, `AAAA-MM-JJ` : ce que « aujourd'hui » veut dire au comptoir. */
const PARIS_DAY = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

/**
 * L'état aux dates corrigées. Rien d'autre ne bouge : ni la grille, ni les
 * avenants, qui doivent tenir dans la nouvelle période.
 *
 * @throws {PausedMercurialeWindowError} elle est en pause (C1).
 * @throws {MercurialeAlreadyStartedError} son début est atteint (C1).
 * @throws {PastCorrectedStartError} le nouveau début tombe avant aujourd'hui à Paris (C2).
 * @throws {ReversedValidityWindowError} la fin n'est pas après le début (C3).
 * @throws {AmendmentOutsideCorrectedWindowError} un avenant non rangé en sortirait (C4).
 */
export function correctedWindowState(
  state: CompanyMercurialeState,
  validFrom: Date,
  validTo: Date | null,
  now: Date,
): CompanyMercurialeState {
  if (state.lifecycle.pausedAt !== null) {
    throw new PausedMercurialeWindowError(state.label);
  }
  if (state.validFrom.getTime() <= now.getTime()) {
    throw new MercurialeAlreadyStartedError(state.label, state.validFrom);
  }
  // Le jour, et non l'instant : « aujourd'hui » commence à minuit à Paris,
  // déjà passé quand on corrige à 10 h.
  if (PARIS_DAY.format(validFrom) < PARIS_DAY.format(now)) {
    throw new PastCorrectedStartError(validFrom);
  }
  if (validTo !== null && validTo.getTime() <= validFrom.getTime()) {
    throw new ReversedValidityWindowError(validFrom, validTo);
  }
  const outside = state.amendments.find(
    (amendment) => amendment.archivedAt === null && !fitsIn(amendment, validFrom, validTo),
  );
  if (outside !== undefined) {
    throw new AmendmentOutsideCorrectedWindowError(outside.id, outside.validFrom, outside.validTo);
  }
  return { ...state, validFrom, validTo };
}

/**
 * Un avenant tient dans la période s'il ne la précède pas et ne la déborde
 * pas. Sans fin propre, il court jusqu'à celle du document : il suit donc la
 * nouvelle fin, à condition de commencer avant elle.
 */
function fitsIn(amendment: MercurialeAmendment, from: Date, to: Date | null): boolean {
  if (amendment.validFrom.getTime() < from.getTime()) {
    return false;
  }
  if (to === null) {
    return true;
  }
  return (
    amendment.validFrom.getTime() < to.getTime() &&
    (amendment.validTo === null || amendment.validTo.getTime() <= to.getTime())
  );
}

/**
 * Le motif (C7), obligatoire : on doit savoir qui a déplacé quoi, et pourquoi.
 *
 * @throws {MissingWindowCorrectionReasonError} vide ou blanc.
 */
export function checkedWindowCorrectionReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new MissingWindowCorrectionReasonError();
  }
  return trimmed;
}
