/**
 * **« Tiens le plan arrêté de cette journée le temps de mon geste »** — port
 * que le fournil DÉCLARE et IMPLÉMENTE, que le colisage et la livraison
 * appellent au premier geste qui fait « commencer » une journée (audit du
 * réassort, 2026-11-02).
 *
 * ## La course qu'il ferme
 *
 * La réouverture refuse une journée dont le colisage ou la livraison a
 * commencé (`DayPackingProgressReader`, `DayDispatchProgressReader`). Elle lit
 * ces deux réponses SOUS le verrou de la journée ; mais un geste du colisage
 * (ouvrir un sac, mettre au bac) ou de la livraison (charger un bac, faire
 * partir une tournée) ne prenait aucun verrou commun. Validé pendant que la
 * réouverture tenait le sien, il restait invisible à sa lecture : le plan
 * était effacé sous un sac déjà ouvert.
 *
 * `hold` prend le verrou de la journée en mode PARTAGÉ, dans la transaction
 * de l'appelant et jusqu'à son `COMMIT`, puis dit si le plan est arrêté. Les
 * gestes du colisage ne s'attendent donc pas entre eux ; la réouverture (et
 * l'arrêt, et le retirage), qui prennent le verrou EXCLUSIF, attendent qu'ils
 * aient validé — et voient alors ce qu'ils ont écrit. Un geste qui arrive
 * après une réouverture lit `false` et refuse.
 *
 * 🔴 Dans une unité de travail seulement (l'adaptateur refuse sinon). Ne pas
 * appeler, dans la même transaction, un geste du fournil qui prend le verrou
 * exclusif : deux transactions qui monteraient de partagé à exclusif
 * s'attendraient l'une l'autre.
 *
 * `production → packing` et `production → delivery` restent interdits : le
 * fournil ne sait pas qui l'appelle.
 */
export abstract class ArrestedPlanHold {
  /** Verrou partagé de la journée jusqu'au `COMMIT` de l'appelant ; `true` si le plan est arrêté. */
  abstract hold(serviceDay: string): Promise<boolean>;
}
