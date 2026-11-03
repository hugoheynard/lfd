import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus d'une feuille retirée** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.3) — la commande a été annulée après l'arrêt du plan ; ce qu'elle avait
 * au bac est revenu à la réserve. Depuis le 2026-11-03 (Hugo, option b), aussi
 * une commande remise au client sans rien au bac (`PackingSheet.leaveAtHandover`).
 */

/** Tout geste sur une feuille retirée : elle ne bouge plus. */
export class PackingSheetWithdrawnError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.sheet.withdrawn",
      `La feuille de la commande ${reference} est retirée du colisage et ne se modifie plus : la commande a été annulée après l'arrêt du plan (ce qui était au bac est revenu à la réserve du jour), ou remise au client alors que rien n'était au bac. Rafraîchir le poste.`,
    );
  }
}

/**
 * Retirer une feuille qui a encore des contenants vivants : le geste de
 * retrait les annule d'abord, dans la même transaction. Un appel qui arrive
 * ici a sauté une étape — défense de l'invariant, pas un cas du poste.
 */
export class PackingSheetHasLiveContainersError extends BusinessError {
  constructor(reference: string, live: number) {
    super(
      "packing.sheet.live_containers",
      `La feuille de ${reference} porte encore ${String(live)} contenant(s) vivant(s) : annulez-les avant de la retirer.`,
    );
  }
}

/**
 * Le fournil dit la commande inscrite, mais pas à son jour de service : sa
 * feuille vivrait ailleurs, et la retirer ici la laisserait vivante là-bas.
 * On refuse plutôt que de retirer à moitié.
 */
export class InscribedOrderNotOnDayError extends BusinessError {
  constructor(orderId: string, serviceDay: string) {
    super(
      "packing.sheet.not_on_day",
      `La commande ${orderId} est inscrite au plan, mais pas au ${serviceDay}, son jour de service : sa feuille de colisage ne peut pas être retirée d'ici. Voyez avec le fournil avant d'annuler.`,
    );
  }
}
