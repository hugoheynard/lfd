import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { MinQuantities } from "../value-objects/min-quantities.js";
import type { ProPriceHt } from "../value-objects/pro-price-ht.js";
import type { SaleUnit } from "../value-objects/sale-terms.js";

/**
 * **La déclaration d'allergènes** — ce que la déclinaison contient, et ses
 * traces. `null` = personne ne s'est prononcé ; `declared: []` = « aucun
 * allergène », une affirmation.
 *
 * Les deux tableaux voyagent ENSEMBLE parce qu'ils viennent d'une seule ligne
 * de `variant_allergens` : l'absence devient indivisible, et on ne peut pas
 * lire les traces sans avoir traité le silence
 * (`plan-separer-allergenes-et-nutrition.md`, §5 et §7).
 */
export interface VariantAllergenSheetSnapshot {
  readonly declared: readonly string[];
  readonly mayContain: readonly string[];
}

/**
 * Ce que l'instantané rend sous `nutrition` : les valeurs pour 100 g, chaque
 * champ `null` quand elle n'est pas renseignée — **et rien d'autre**.
 *
 * Les traces en sont sorties le 2026-09-22 (lot 7 du plan
 * `plan-separer-allergenes-et-nutrition.md`) : une trace est une déclaration
 * d'allergène, elle suit le drapeau des allergènes, et la laisser ici obligeait
 * à recoller les deux moitiés à chaque lecture.
 */
export interface VariantNutritionSnapshot {
  readonly energyKcal: number | null;
  readonly fatG: number | null;
  readonly saturatedFatG: number | null;
  readonly carbsG: number | null;
  readonly sugarsG: number | null;
  readonly proteinG: number | null;
  readonly saltG: number | null;
  readonly glycemicIndex: number | null;
}

/**
 * **Ce que la moitié nutrition pose** — exactement ce que l'instantané rend.
 *
 * Un alias et non une forme dérivée : depuis que les traces ont quitté la
 * nutrition, ce qu'on écrit et ce qu'on lit sont la même chose, et un `Omit`
 * laisserait croire qu'il reste un champ à retrancher.
 */
export type VariantNutritionValues = VariantNutritionSnapshot;

export interface VariantSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  /**
   * Le produit qu'elle est devenue par détachement
   * (`plan-gestes-de-declinaison.md`, G2) — posé avec `isDiscontinued`, et ce
   * qui interdit de la désarchiver. Facultatif à la LECTURE de l'instantané
   * (absent = `null`) : les dizaines d'instantanés de test écrits avant lui
   * n'ont pas à le nommer ; l'agrégat le rend toujours.
   */
  readonly detachedToProductId?: string | null | undefined;
  /**
   * La déclinaison dont elle est la COPIE, quand un détachement l'a fait
   * naître (`plan-pro-voit-les-declinaisons.md`, « Trace de la déclinaison
   * d'origine »). Posée à la naissance ({@link Variant.openDefaultFrom}),
   * jamais réécrite : un changement de défaut ne la déplace pas. Facultatif à
   * la LECTURE (absent = `null`), comme `detachedToProductId`.
   */
  readonly detachedFromVariantId?: string | null | undefined;
  /**
   * Le **libellé interne** posé en propre (`plan-identite-de-declinaison.md`,
   * I3) ; `null` = c'est le français du nom de boutique. Facultatif à la
   * LECTURE, comme `detachedToProductId`, pour les instantanés de test écrits
   * avant lui.
   */
  readonly internalLabel?: string | null | undefined;
  readonly position: number;
  /**
   * Cette déclinaison **suit les ALLERGÈNES de celle par défaut** — traces
   * comprises, puisqu'une trace est un allergène.
   *
   * Un drapeau, et non l'absence de `allergens` : cette absence dit déjà « rien
   * n'a été déclaré », l'état que l'invariant 7 refuse de mettre en vente. Lui
   * faire dire aussi « hérite » ferait dire deux choses au même silence, dont
   * l'une autoriserait la vente d'un article non étiqueté.
   *
   * Le nom reste celui de la COLONNE, qui ne bouge pas (§6d du plan).
   *
   * Toujours `false` sur la déclinaison par défaut : elle ne peut pas se suivre
   * elle-même.
   */
  readonly regulatoryFollowsDefault: boolean;
  /**
   * Cette déclinaison **suit les VALEURS nutritionnelles de celle par défaut**.
   *
   * Séparé du précédent parce que les deux moitiés de la fiche s'enregistrent
   * séparément depuis le lot 3 : un drapeau unique aurait fait suivre le défaut
   * sur une moitié qu'on venait de saisir à la main.
   *
   * Toujours `false` sur la déclinaison par défaut.
   */
  readonly nutritionFollowsDefault: boolean;
  /**
   * Cette déclinaison **suit le tarif de celle par défaut** — prix ET poids
   * ensemble, jamais l'un sans l'autre : un prix hérité au-dessus d'un poids
   * propre décrirait un article que personne ne vend.
   *
   * Toujours `false` sur la déclinaison par défaut.
   */
  readonly pricingFollowsDefault: boolean;
  /** Prix canonique en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  /** Poids net de l'unité vendue, en grammes ; `null` = non renseigné. */
  readonly weightGrams: number | null;
  /**
   * Le prix professionnel HORS TAXE saisi, en millicentimes (10⁻⁵ €) ;
   * `null` = pas saisi. Lu seulement sous la méthode `entered` (lot P) ; il
   * suit le défaut avec le prix public quand `pricingFollowsDefault`.
   */
  readonly proPriceMillicents: number | null;
  /**
   * Le prix au kilo pro HT SAISI, en millicentimes ; `null` = non saisi.
   * Informatif (`saisir-un-prix.md`) : jamais calculé, jamais appliqué.
   */
  readonly proPricePerKgMillicents: number | null;
  /** Le prix au kilo public TTC SAISI, en centimes ; `null` = non saisi. */
  readonly publicPricePerKgTtcCents: number | null;
  /**
   * Chaque prix au kilo est-il MONTRÉ en boutique, par audience
   * (`saisir-un-prix.md`) ? Faux : le prix reste saisi, mais le canal ne
   * reçoit plus CELUI-LÀ — le public TTC aux particuliers, le pro HT aux pros.
   * Vrais par défaut ; suivent le défaut avec le tarif quand
   * `pricingFollowsDefault`.
   */
  readonly pricePerKgShownPublic: boolean;
  readonly pricePerKgShownPro: boolean;
  /**
   * L'unité de vente, propre à CETTE déclinaison — jamais héritée du défaut,
   * même quand elle en suit le tarif (`vente-au-poids.md`). Le pas et le
   * minimum, en grammes, suivent l'unité : `null` à la pièce.
   */
  readonly saleUnit: SaleUnit;
  readonly weightMinGrams: number | null;
  readonly weightStepGrams: number | null;
  /**
   * **A-t-elle déjà été publiée ?** — vrai dès que son produit a été mis en
   * vente avec elle, et pour toujours : une fiche retirée de la vente a pu
   * être commandée. C'est ce qui fige l'unité de vente.
   */
  readonly hasBeenPublished: boolean;
  /**
   * La quantité minimale d'achat, en pièces, par audience
   * (`plan-quantite-minimale.md`). `null` = aucun minimum pour l'audience. **Résolue** dans
   * l'instantané de l'agrégat : une déclinaison qui suit le défaut rend ici
   * celle du défaut, et une déclinaison au poids n'en rend jamais.
   */
  readonly minQuantities: MinQuantities;
  /**
   * Suit-elle la quantité minimale du défaut ? Toujours `false` sur le défaut.
   * Le même idiome que {@link VariantSnapshot.pricingFollowsDefault}, hors de
   * {@link VariantAspect} : elle a sa propre route, pas la case d'alignement.
   */
  readonly minQuantityFollowsDefault: boolean;
  /**
   * **Sur mesure** — une recette faite pour un ou quelques clients
   * (`plan-sur-mesure-par-declinaison.md`, V1). Le référentiel ne connaît
   * aucune société : à qui l'article est attribué se décide au commerce.
   * Facultatif à la LECTURE (absent = `false`, la valeur de la colonne) ;
   * l'entité le rend toujours. Jamais résolu sur le défaut : chaque
   * déclinaison porte le sien.
   */
  readonly customRecipe?: boolean | undefined;
  /**
   * La déclaration d'allergènes, traces comprises. `null` = **non
   * renseignée** ; `declared: []` = « aucun allergène » déclaré.
   */
  readonly allergenSheet: VariantAllergenSheetSnapshot | null;
  /** Les valeurs pour 100 g ; `null` = personne n'en a saisi aucune. */
  readonly nutrition: VariantNutritionSnapshot | null;
}

/** Ce que la section « Tarif & TVA » possède, pour une déclinaison. */
export interface VariantPricing {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  /**
   * Le prix pro HT saisi (lot P). **Absent = inchangé** : les écrans et les
   * semis d'avant le lot n'envoient pas ce champ, et l'absence ne doit pas
   * effacer une saisie. `null` = effacer.
   */
  readonly proPrice?: ProPriceHt | null;
  /**
   * Les prix au kilo saisis (`saisir-un-prix.md`). Même règle que le prix
   * pro : **absent = inchangé**, `null` = effacer.
   */
  readonly proPricePerKg?: ProPriceHt | null;
  readonly publicPricePerKgTtcCents?: number | null;
  /** Montrer chaque prix au kilo à son audience (`saisir-un-prix.md`). Absent = inchangé. */
  readonly pricePerKgShownPublic?: boolean;
  readonly pricePerKgShownPro?: boolean;
  /**
   * L'unité de vente et, au poids, le pas et le minimum
   * (`vente-au-poids.md`). Chaque champ : **absent = inchangé**. Passer à
   * la pièce sans les nommer efface le pas et le minimum, qui suivent l'unité.
   */
  readonly saleUnit?: SaleUnit;
  readonly weightMinGrams?: number | null;
  readonly weightStepGrams?: number | null;
}
