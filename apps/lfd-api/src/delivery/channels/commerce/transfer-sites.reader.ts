import type { GpsPoint } from "@lfd/contracts";

/** Une commande en retrait à un site servi par transfert. */
export interface TransferOrderRef {
  readonly orderId: string;
  /** Le site figé à la passation (S2) — identifiant opaque du commerce. */
  readonly siteId: string;
  /** Le nom du site à cet instant — figé sur le transfert qui s'ouvre. */
  readonly siteLabel: string;
  /** Son jour demandé (`AAAA-MM-JJ`). */
  readonly day: string;
}

/** Ce qu'il faut pour placer le transfert d'un site, un jour donné. */
export interface TransferSiteFacts {
  readonly siteId: string;
  /** Le nom du site, tel que l'écran des sites l'affiche. */
  readonly label: string;
  /** `null` : le site n'a pas de point GPS — on ne route pas vers nulle part. */
  readonly gps: GpsPoint | null;
  /** `integrated` (par défaut) : dans une tournée du jour ; `dedicated` : seul. */
  readonly mode: "integrated" | "dedicated";
  /**
   * L'heure d'arrivée requise au site (`HH:MM`), calculée comme l'échéance du
   * fournil (T0, `SiteDeadlines`) ; `null` : incalculable — le transfert se
   * place alors sans fenêtre.
   */
  readonly arrivalBy: string | null;
}

/**
 * **Les commandes servies par transfert interne** (plan du transfert interne,
 * §6, lot T1) — ce que la livraison DÉCLARE et que le commerce implémente.
 * La livraison ne lit ni `public.orders` ni `public.pickup_addresses` : le
 * commerce décide qu'une commande est un retrait actif d'un site servi par
 * transfert, et la livraison n'apprend que l'identifiant opaque du site.
 *
 * Lu DANS la transaction de l'abonné à l'arrêt du plan : aucune lecture
 * réseau ici (l'heure d'arrivée, qui appelle le calcul routier, est l'autre
 * port, lu hors transaction).
 */
export abstract class TransferOrdersReader {
  /**
   * Parmi ces commandes, les retraits NON annulés d'un site servi par
   * transfert, avec leur site et leur jour. Les autres sont absentes.
   */
  abstract transferOrdersAmong(orderIds: readonly string[]): Promise<readonly TransferOrderRef[]>;
}

/**
 * **Les sites servis par transfert, pour un jour** — de quoi placer leur
 * transfert dans une tournée (plan du transfert interne, §5, lot T1).
 * Déclaré par la livraison, implémenté par le commerce. Lu HORS transaction :
 * l'heure d'arrivée appelle le calcul routier.
 */
export abstract class TransferSitesReader {
  /** Les sites demandés ; un site inconnu est absent. */
  abstract sitesFor(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, TransferSiteFacts>>;
}
