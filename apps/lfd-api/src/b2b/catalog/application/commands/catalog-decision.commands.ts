/**
 * Les **intentions** du back-office sur un article, une classe par geste.
 *
 * Elles portent le vocabulaire du commercial, pas celui de la table : « poser un
 * prix B2B », « revenir au tarif du PIM », « masquer ». Une commande unique
 * `UpdateCatalogItem(sku, patch)` aurait rendu le journal illisible et forcé le
 * handler à deviner l'intention depuis les champs présents.
 */

export class SetB2bPriceCommand {
  constructor(
    readonly sku: string,
    readonly priceMillicents: number,
    readonly decidedBy: string | null,
  ) {}
}

/** Retire le prix B2B : l'article repasse au tarif du PIM et suivra ses hausses. */
export class AlignOnPimPriceCommand {
  constructor(readonly sku: string) {}
}

export class SetCatalogVisibilityCommand {
  constructor(
    readonly sku: string,
    readonly hidden: boolean,
    readonly decidedBy: string | null,
  ) {}
}

export class SetCatalogFeaturedCommand {
  constructor(
    readonly sku: string,
    readonly featured: boolean,
    readonly decidedBy: string | null,
  ) {}
}
