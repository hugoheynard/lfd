import { describeDay } from "../pricing-act-summary.js";
import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de « Corriger les dates »** d'une mercuriale
 * (`documentation/pricing/mercuriales/comprendre-une-mercuriale.md`, § 9, C1 à C7).
 *
 * Le geste ne vaut que tant qu'elle n'a pas commencé : aucune commande ne peut
 * alors l'avoir citée. Chaque refus nomme le cas et le geste de sortie — il est
 * lu par un commercial sur la fiche du client.
 */

/** **Elle a commencé** (C1) : une commande peut l'avoir citée, ses dates sont figées. */
export class MercurialeAlreadyStartedError extends BusinessError {
  constructor(
    readonly label: string,
    readonly validFrom: Date,
  ) {
    super(
      "pricing.mercuriale.window.already_started",
      `La mercuriale « ${label} » a commencé le ${describeDay(validFrom)} : ses dates ne se corrigent plus. Elle a commencé : clôturez-la, puis posez-en une autre.`,
    );
  }
}

/** **Elle est en pause** (C1) : la pause porte un instant que des dates déplacées rendraient incohérent. */
export class PausedMercurialeWindowError extends BusinessError {
  constructor(readonly label: string) {
    super(
      "pricing.mercuriale.window.paused",
      `La mercuriale « ${label} » est en pause : ses dates ne se corrigent pas tant qu'elle l'est. Reprenez-la d'abord, ou clôturez-la puis posez-en une autre.`,
    );
  }
}

/** **Un nouveau début déjà passé** (C2) : pas d'effet rétroactif. */
export class PastCorrectedStartError extends DomainError {
  constructor(readonly validFrom: Date) {
    super(
      "pricing.mercuriale.window.past_start",
      `Le nouveau début, le ${describeDay(validFrom)}, est déjà passé : choisissez aujourd'hui ou une date à venir.`,
    );
  }
}

/**
 * **Un avenant que la nouvelle période ne contiendrait plus** (C4). Rien
 * n'est déplacé en silence : un avenant déplacé dirait autre chose.
 */
export class AmendmentOutsideCorrectedWindowError extends BusinessError {
  constructor(
    readonly amendmentId: string,
    readonly amendmentFrom: Date,
    readonly amendmentTo: Date | null,
  ) {
    super(
      "pricing.mercuriale.window.amendment_outside",
      `L'avenant du ${describeDay(amendmentFrom)}${
        amendmentTo === null ? "" : ` au ${describeDay(amendmentTo)}`
      } sortirait de la nouvelle période : choisissez des dates qui le contiennent.`,
    );
  }
}

/** **Une correction de dates sans motif** (C7). */
export class MissingWindowCorrectionReasonError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.window.missing_reason",
      "Corriger les dates d'une mercuriale demande un motif : écrivez pourquoi elles changent.",
    );
  }
}
