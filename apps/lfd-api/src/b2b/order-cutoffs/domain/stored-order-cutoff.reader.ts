import type { OrderCutoffView } from "@lfd/contracts";

/**
 * Port de **lecture** de la règle générale telle qu'elle est rangée — qu'elle
 * soit en vigueur ou non. Pas de mur : la règle est globale, pas rattachée à
 * une entreprise ; la porte est celle du staff, tenue par le contrôleur.
 *
 * C'est la lecture de l'écran des réglages et de la page du référentiel, qui
 * montrent la règle même quand l'interrupteur l'éteint. Ceux qui l'OPPOSENT
 * lisent `OrderCutoffsInForce`.
 *
 * Il listait toutes les règles (point × jour) jusqu'au 2026-10-21 ; une ligne
 * résiduelle qui en porterait n'est pas rendue.
 */
export abstract class StoredOrderCutoffReader {
  /** La règle générale, ou `null` tant que personne ne l'a posée. */
  abstract general(): Promise<OrderCutoffView | null>;
}
