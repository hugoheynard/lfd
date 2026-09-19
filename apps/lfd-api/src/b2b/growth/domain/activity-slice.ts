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
 * comptabilité écrit sur la fiscalité, et rien d'autre.
 *
 * Une liste de types et pas un module : le module `pim` ouvrirait tout le
 * référentiel — fiches, familles, points de vente —, alors que seuls la TVA et
 * les règles comptables sont à elle. `product.` et `product_category.` y
 * entrent donc par leur seul fait de TVA.
 *
 * Inventaire des faits écrits vérifié le 2026-09-19 dans `PIM_EVENTS`
 * (`pim/journal/pim-journal.ts`) : `vat_rate.created`, `.rate_changed`,
 * `.renamed`, `.deleted` ; `accounting_rules.pro_ratio_changed`,
 * `.method_changed`. Les préfixes couvrent d'avance un fait de la même famille
 * qui s'y ajouterait. Les contextes de vente (`sales_context.*`), qui portent
 * pourtant un taux par contexte, n'y sont PAS : ils s'écrivent sous
 * `pim_settings`, que la comptabilité n'a pas — les ajouter est une décision,
 * pas un oubli à corriger ici.
 */
export const TAX_JOURNAL_SLICE: ActivitySlice = {
  types: ["product_category.vat_changed", "product.vat_changed"],
  prefixes: ["vat_rate.", "accounting_rules."],
};
