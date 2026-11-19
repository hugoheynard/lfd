import type { CategoryVatPercents } from "../../../shared/domain/value-objects/vat-percents.js";
import type { ProductRecord } from "./product.repository.js";

/** Ce que la résolution lit d'une famille déjà chargée : ses taux propres, par contexte. */
export interface VatFamily {
  readonly id: string;
  readonly vatByContext: Readonly<Record<string, string>>;
}

/**
 * **Le taux effectif de chaque fiche, par contexte** : sa dérogation
 * par-dessus celle de sa famille, résolue en pourcentages.
 *
 * Par FICHE et non par famille : une fiche peut déroger, et une réponse par
 * famille ne dirait plus ce qu'on facture. L'activation, la liste, les
 * constats et la révision passent tous par ici — le seul endroit où la règle
 * « fiche d'abord, famille ensuite » est résolue.
 *
 * Une famille inconnue est un REFUS (`CategoryNotFoundError`), pas une
 * absence de taux : un rattachement cassé et un taux à régler ne doivent pas
 * rendre le même symptôme.
 *
 * `families` évite de relire les familles que l'appelant a DÉJÀ chargées. Le
 * contrat : la liste passée contient **toutes** les familles, archivées
 * comprises (`AllCategoriesReader`), et une famille qui n'y est pas lève
 * toujours `CategoryNotFoundError` — une liste partielle se lirait comme un
 * rattachement cassé. Sans elle, chaque famille citée est relue une fois.
 */
export abstract class EffectiveVatReader {
  abstract vatPercents(
    products: readonly ProductRecord[],
    families?: readonly VatFamily[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>>;
}
