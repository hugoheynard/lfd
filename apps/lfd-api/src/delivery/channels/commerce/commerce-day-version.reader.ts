/**
 * **La version d'une journée du COMMERCE, vue par la livraison**
 * (`documentation/livraisons/parcours-du-livreur.md`, PL4) — ce que la
 * livraison DÉCLARE et que le commerce implémente (`b2b/orders/infrastructure/`,
 * depuis son journal `public.day_change`), relié dans
 * `appBootstrap/delivery-feed.module.ts`.
 *
 * « Ma tournée » doit se relire quand une commande devient prête, et ce fait
 * vit au commerce : la livraison ne lit pas son journal en direct
 * (`architecture-isolation-livraison.md`, § 5 — « c'est l'écran, ou ici la
 * route, qui suit les deux versions ; jamais un déclencheur qui écrit chez
 * l'autre »). Un port à lui (ISP) : aucun autre lecteur n'en a besoin.
 */
export abstract class CommerceDayVersionReader {
  /**
   * Le numéro du journal du commerce pour ce jour `AAAA-MM-JJ`, `0` si aucun.
   * Opaque, croissant : il se compare, il ne compte rien.
   */
  abstract versionOf(day: string): Promise<number>;
}
