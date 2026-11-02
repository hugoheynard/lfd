import type { SameDayProWithoutCredit } from "@lfd/contracts";

import type { SameDayDoorSettings } from "../../../order-cutoffs/domain/same-day-doors.js";

/**
 * Les réglages du **circuit du jour J** que les commandes lisent (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §3, lots
 * L3–L4) : qui peut viser aujourd'hui, le sort d'un pro sans crédit au
 * comptoir, et combien de temps un paiement en cours tient le stock.
 */
export interface SameDayCircuitSettings extends SameDayDoorSettings {
  readonly sameDayProWithoutCredit: SameDayProWithoutCredit;
  readonly shelfHoldMinutes: number;
}

/**
 * **Une commande peut-elle viser aujourd'hui ?** — la page Réglages ›
 * Commandes › Jour même.
 *
 * Depuis le lot L4 (Hugo, 2026-11-02), les réglages par clientèle font foi ;
 * l'interrupteur unique `same_day_allowed` (plan
 * `documentation/commandes/passation/plan-reglages-commandes.md` §8.3) n'est
 * plus lu — colonne morte, gardée en base.
 *
 * Port étroit (ISP) : la passation ne lit que ces cinq réglages.
 */
export abstract class SameDayOrderReader {
  abstract settings(): Promise<SameDayCircuitSettings>;
}
