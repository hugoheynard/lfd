/**
 * Port de **lecture** : le « Retrait immédiat » du comptoir de ce point
 * passe-t-il sans vérifier le stock reçu ? Réglé dans Réglages › Comptoir
 * (Hugo, 2026-11-25) ; lu par la passation et la révision d'une commande sur
 * stock saisie au comptoir. Une commande en ligne ne le lit jamais.
 */
export abstract class CounterImmediateWithoutStock {
  /** Le réglage du point, ou `IMMEDIATE_WITHOUT_STOCK_BY_DEFAULT` s'il n'a jamais été réglé. */
  abstract allowsAt(siteId: string): Promise<boolean>;
}
