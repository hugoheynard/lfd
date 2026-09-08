import type {
  PosedMercurialeLineView,
  PosedMercurialeStatus,
  PosedMercurialeView,
} from "@lfd/contracts";

import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";

/**
 * **La mercuriale d'un client, telle que son dossier la montre.**
 *
 * ## Ce qui a changé le 2026-09-08
 *
 * Ce fichier remplace `posed-mercuriales.ts`, qui **reconstituait** une
 * mercuriale en regroupant les règles partageant `(libellé, fenêtre)` — la
 * seule chose que la pose leur donnait en commun. Cette déduction ne savait pas
 * distinguer deux poses homonymes sur la même fenêtre, ni une règle saisie à la
 * main qui aurait repris par hasard le même libellé.
 *
 * Il n'y a plus rien à déduire : la mercuriale est un objet, et cette fonction
 * n'est qu'une **projection**. C'est tout l'intérêt de l'avoir rendue réelle.
 *
 * Fonction **pure** : elle reçoit son instant et le nom des articles, elle ne
 * lit ni horloge ni base.
 */

/** De quoi nommer un article. Rendu par l'appelant, qui tient le catalogue. */
export type ProductNamer = (sku: string) => string;

/**
 * L'état de la mercuriale **à l'instant lu**.
 *
 * Dérivé, jamais stocké : une colonne `status` pourrait contredire ses propres
 * dates. `suspended` l'emporte sur la fenêtre — une mercuriale qu'on a mise en
 * pause n'agit pas, même si sa fenêtre est ouverte.
 */
function statusOf(mercuriale: CompanyMercuriale, at: Date): PosedMercurialeStatus {
  const suspendedFrom = mercuriale.suspendedFrom;
  if (suspendedFrom !== null && suspendedFrom.getTime() <= at.getTime()) {
    return "suspended";
  }
  const { validFrom, validTo } = mercuriale.toPersistence();
  if (validFrom.getTime() > at.getTime()) {
    return "scheduled";
  }
  // Borne haute EXCLUE, comme partout dans ce contexte : une fenêtre qui se
  // ferme à l'instant lu est déjà terminée.
  if (validTo !== null && validTo.getTime() <= at.getTime()) {
    return "expired";
  }
  return "active";
}

/**
 * Ce qu'elle accorde, **du moins cher au plus cher**.
 *
 * Trié par prix et non par nom : ce qu'on cherche en ouvrant une mercuriale est
 * ce qu'on a le plus lâché, pas la place d'un article dans l'alphabet.
 *
 * Une ligne par **palier** : une grille à trois paliers sur un article en donne
 * trois, et les fondre obligerait à choisir laquelle montrer.
 */
function linesOf(
  mercuriale: CompanyMercuriale,
  nameOf: ProductNamer,
): readonly PosedMercurialeLineView[] {
  return mercuriale.lines
    .flatMap((line) =>
      line.tiers.map((tier) => ({
        sku: line.sku,
        productName: nameOf(line.sku),
        unitPriceMillicents: tier.unitPriceMillicents,
        minQuantity: tier.minQuantity,
      })),
    )
    .sort((left, right) => left.unitPriceMillicents - right.unitPriceMillicents);
}

/**
 * @param nameOf retombe sur le SKU nu quand le catalogue ne connaît plus
 *   l'article : la mercuriale garde sa ligne, et l'écran doit pouvoir dire
 *   qu'elle ne vise plus rien.
 */
export function posedMercurialeView(
  mercuriale: CompanyMercuriale,
  at: Date,
  nameOf: ProductNamer,
): PosedMercurialeView {
  const state = mercuriale.toPersistence();
  const lines = linesOf(mercuriale, nameOf);
  return {
    id: state.id,
    label: state.label,
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo?.toISOString() ?? null,
    status: statusOf(mercuriale, at),
    // Le nombre de PALIERS. Le champ s'appelle encore `ruleCount` parce qu'un
    // front en ligne le lit ; il est déprécié au contrat.
    ruleCount: lines.length,
    // Les articles DISTINCTS : une grille à trois paliers sur vingt articles
    // pèse soixante lignes et vingt articles. Annoncer soixante ferait passer le
    // nombre de paliers pour l'étendue de la négociation.
    skuCount: state.lines.length,
    createdBy: state.createdBy,
    lines,
  };
}
