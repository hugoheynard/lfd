/**
 * **Quel site est le départ des tournées, aujourd'hui** (Hugo, 2026-10-13 :
 * « il faut qu'on puisse interroger quels points font de la livraison, et
 * lequel je choisis en Livraison »).
 *
 * La livraison DÉCLARE et IMPLÉMENTE ce port, le commerce le lit — comme
 * `OrderDeliveryHistoryReader`. Le commerce s'en sert pour refuser de retirer
 * « Livraison » au site de départ, et pour le signaler sur la page du site.
 * `delivery → b2b` reste interdit : la livraison ne sait pas qui la lit.
 *
 * Le départ est RÉSOLU comme l'écran Livraison › Point de départ le montre :
 * le choix enregistré s'il désigne un site qui livre, sinon le site par défaut
 * parmi ceux qui livrent, sinon le premier — `null` s'il n'y en a aucun.
 */
export abstract class DepartureSiteReader {
  abstract currentSiteId(): Promise<string | null>;
}
