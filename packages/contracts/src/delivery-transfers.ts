/**
 * **Le manifeste d'un transfert interne** (2026-10-13, plan du transfert
 * interne, lot T1 ; décision de Hugo : « on doit savoir ce qu'on
 * transporte »).
 *
 * Un même transfert porte EN MÊME TEMPS des commandes (retraits au site) et
 * du réassort de la boutique du site (non bâti) : deux sections, chacune
 * détaillée par élément et totalisée par SKU, et un total tous genres
 * confondus. Les deux genres ont le MÊME format de ligne — le réassort s'y
 * branchera sans le changer.
 *
 * Calculé à la lecture tant que le transfert n'est pas parti ; FIGÉ au départ
 * ensuite (`frozen`), la référence de la réception au site.
 */

/** Une ligne : un SKU, son libellé figé à la passation, une quantité. */
export interface TransferManifestLineView {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Ce que contient un élément du transfert. */
export interface TransferManifestItemView {
  readonly itemId: string;
  readonly kind: "order" | "refill";
  /** La commande (ou le réassort) — identifiant opaque. */
  readonly subjectId: string;
  readonly lines: readonly TransferManifestLineView[];
}

export interface TransferManifestSectionView {
  readonly items: readonly TransferManifestItemView[];
  /** Par SKU, dans l'ordre de première apparition. */
  readonly totals: readonly TransferManifestLineView[];
}

export interface InternalTransferManifestView {
  readonly transferId: string;
  readonly day: string;
  readonly siteLabel: string;
  /** Parti le (instant ISO), ou `null` : prévu. */
  readonly departedAt: string | null;
  /** `true` : le manifeste est celui figé au départ ; `false` : calculé à l'instant. */
  readonly frozen: boolean;
  readonly orders: TransferManifestSectionView;
  readonly refills: TransferManifestSectionView;
  /** Tous genres confondus, par SKU. */
  readonly totals: readonly TransferManifestLineView[];
}
