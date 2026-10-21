/**
 * La règle générale du commerce, telle que le référentiel la MONTRE.
 *
 * `rule` est `null` quand le commerce n'a aucune règle générale ; `enabled`
 * dit si l'interrupteur la sert (désactivée, elle reste en base et n'oppose
 * rien).
 */
export interface GeneralOrderCutoff {
  readonly enabled: boolean;
  readonly rule: {
    readonly daysBefore: number;
    readonly time: string;
    readonly graceMinutes: number;
  } | null;
}

/**
 * **Lire la règle générale de l'heure limite** — un port que le référentiel
 * DÉCLARE et que le commerce implémente (`appBootstrap/` les relie).
 *
 * Pourquoi un port et pas la route `admin/order-cutoffs` : elle est murée
 * par `lfc_order_settings`, et la page des limites de commande l'est par
 * `pim_catalog` — un éditeur du catalogue n'a pas à recevoir le droit de
 * régler l'heure limite pour pouvoir la lire. Et `pim → b2b` est interdit par
 * la matrice : le référentiel dit ce dont il a besoin, il ne va pas le
 * chercher.
 *
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4) : « toute la production » n'est plus un rang du référentiel ; la page
 * qui le portait montre désormais la règle du commerce, en lecture.
 */
export abstract class GeneralOrderCutoffReader {
  abstract read(): Promise<GeneralOrderCutoff>;
}
