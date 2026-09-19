/**
 * Une **tranche** du journal : le bord fermé d'une lecture à qui l'on n'ouvre
 * pas tout le journal. Un fait y entre si son type est l'un des `types`, ou
 * commence par l'un des `prefixes` — et rien d'autre ne l'y fait entrer.
 *
 * Elle est posée par le serveur, jamais lue dans la requête : les filtres de
 * l'appelant s'y ajoutent par `AND`, et aucun ne peut l'élargir.
 */
export interface ActivitySlice {
  /** Des types exacts (`product.vat_changed`). */
  readonly types: readonly string[];
  /** Des familles entières, point compris (`vat_rate.`). */
  readonly prefixes: readonly string[];
}

/**
 * La **tranche fiscale** (plan du journal, lot 4, 2026-09-19) : ce que la
 * comptabilité doit relire parce que ça touche à un taux de TVA — « tout ce
 * qui touche au taux » (Hugo, 2026-09-19) —, et rien d'autre.
 *
 * Une liste de types et pas un module : le module `pim` ouvrirait tout le
 * référentiel — fiches, familles, points de vente. `product.` et
 * `product_category.` y entrent donc par leur seul fait de TVA.
 *
 * Ce qui y entre, et pourquoi (inventaire vérifié le 2026-09-19 dans
 * `PIM_EVENTS` et dans les faits journalisés de `b2b/`) :
 *
 * - `vat_rate.*` — les taux eux-mêmes ;
 * - `product_category.vat_changed`, `product.vat_changed` — le taux d'une
 *   famille, ou la dérogation d'une fiche, **par contexte de vente** : c'est là
 *   que vit « un taux par contexte », la charge est indexée par sa clé ;
 * - `accounting_rules.*` — le rapport et la méthode du prix pro, sous le même
 *   droit que les taux ;
 * - `sales_context.*` — le contexte est l'axe du traitement fiscal. Il ne porte
 *   aucun taux, mais l'ouvrir crée un traitement ; le mettre hors service le
 *   retire de ce qu'on peut régler et de ce que Shopify projette ; le supprimer
 *   efface en cascade les lignes de taux restées sur lui (`onDelete: Cascade`).
 *   Le type ENTIER : `updated` mêle la bascule `active` au libellé et au rang,
 *   et n'a pas de fait dédié ;
 * - `order_late_fee.*` — la surtaxe de retard est une ligne facturée avec SON
 *   taux (`vatRatePercent`), et chacun de ses faits porte ce taux avant et
 *   après. Le type ENTIER : un fait dédié au taux ferait deux faits pour un
 *   geste que le lot 1 a voulu unique.
 *
 * Ce qui n'y entre PAS alors qu'il peut toucher un taux — des faits mêlés dont
 * le fait dédié reste à décider : la fermeture d'un canal
 * (`*.channels_changed`), qui efface les taux du contexte fermé ; le
 * reclassement d'une fiche (`product.identity_saved` avec `categoryId`), qui
 * change la famille dont elle hérite ; la publication (`catalog_revision.pushed`,
 * `catalog_delivery.accepted`), qui porte les taux jusqu'au canal.
 */
export const TAX_JOURNAL_SLICE: ActivitySlice = {
  types: ["product_category.vat_changed", "product.vat_changed"],
  prefixes: ["vat_rate.", "accounting_rules.", "sales_context.", "order_late_fee."],
};
