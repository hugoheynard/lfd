import {
  DefaultVariantCannotFollowItselfError,
  InvalidVariantPricingError,
} from "../errors/product-errors.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { Sku } from "../value-objects/sku.value-object.js";

/** Valeurs nutritionnelles pour 100 g ; chaque champ `null` = non renseigné. */
export interface VariantNutritionSnapshot {
  readonly mayContain: readonly string[];
  readonly energyKcal: number | null;
  readonly fatG: number | null;
  readonly saturatedFatG: number | null;
  readonly carbsG: number | null;
  readonly sugarsG: number | null;
  readonly proteinG: number | null;
  readonly saltG: number | null;
  readonly glycemicIndex: number | null;
}

export interface VariantSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly position: number;
  /**
   * Cette déclinaison **suit la fiche réglementaire de celle par défaut**.
   *
   * Un drapeau, et non l'absence de `allergens` : cette absence dit déjà « rien
   * n'a été déclaré », l'état que l'invariant 7 refuse de mettre en vente. Lui
   * faire dire aussi « hérite » ferait dire deux choses au même silence, dont
   * l'une autoriserait la vente d'un article non étiqueté.
   *
   * Toujours `false` sur la déclinaison par défaut : elle ne peut pas se suivre
   * elle-même.
   */
  readonly regulatoryFollowsDefault: boolean;
  /** Prix canonique en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  /** Poids net de l'unité vendue, en grammes ; `null` = non renseigné. */
  readonly weightGrams: number | null;
  /** `null` = fiche **non renseignée** ; `[]` = « aucun allergène » déclaré. */
  readonly allergens: readonly string[] | null;
  readonly nutrition: VariantNutritionSnapshot | null;
}

/**
 * **La déclinaison — une entité DANS l'agrégat produit.**
 *
 * Elle ne vit jamais seule : on ne la charge pas, on ne la sauve pas, on
 * l'atteint par son produit. C'est ce qui rend tenables les invariants qui
 * traversent les deux (« exactement une par défaut », « pas de publication
 * sans fiche sur chaque déclinaison active »).
 *
 * La fiche réglementaire (`allergens` / `nutrition`) est ici en **lecture
 * seule** : elle s'écrit par son propre verbe, à travers `NutritionRepository`.
 * La déclinaison la porte pour que le produit puisse répondre « suis-je
 * publiable ? » sans aller la rechercher ailleurs.
 */
/** Ce que la section « Tarif & TVA » possède, pour une déclinaison. */
export interface VariantPricing {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
}

export class Variant {
  private readonly identity: string;
  private readonly skuValue: string;
  private readonly nameValue: LocalizedText;
  private readonly optionsValue: Readonly<Record<string, string>>;
  private defaultFlag: boolean;
  private discontinuedFlag: boolean;
  private positionValue: number;
  private priceCentsValue: number | null;
  private weightGramsValue: number | null;
  private readonly allergensValue: readonly string[] | null;
  private readonly nutritionValue: VariantNutritionSnapshot | null;
  private followsDefaultFlag: boolean;

  /**
   * L'instantané, et non onze arguments positionnels.
   *
   * Ils étaient onze, et l'assiette du prix en aurait fait douze — dont trois
   * `boolean` et quatre `number | null` voisins, qu'aucun compilateur ne
   * distingue si on les intervertit. La même raison a fait passer
   * `VatRate.revise` et `Category.setVat` au record.
   */
  private constructor(snapshot: VariantSnapshot) {
    this.identity = snapshot.id;
    this.skuValue = snapshot.sku;
    this.nameValue = snapshot.name;
    this.optionsValue = snapshot.options;
    this.defaultFlag = snapshot.isDefault;
    this.discontinuedFlag = snapshot.isDiscontinued;
    this.positionValue = snapshot.position;
    this.priceCentsValue = snapshot.priceCents;
    this.weightGramsValue = snapshot.weightGrams;
    this.allergensValue = snapshot.allergens;
    this.nutritionValue = snapshot.nutrition;
    this.followsDefaultFlag = snapshot.regulatoryFollowsDefault;
  }

  /**
   * La déclinaison née avec son produit : par défaut, en tête, sans tarif.
   *
   * Elle naît **hors taxe**, l'assiette historique du référentiel. Un article
   * neuf n'a aucune raison de basculer sans qu'on le décide, et le défaut de la
   * base dit la même chose.
   */
  static openDefault(input: { id: string; sku: Sku; name: LocalizedText }): Variant {
    return new Variant({
      id: input.id,
      sku: input.sku.value,
      name: input.name,
      options: {},
      isDefault: true,
      isDiscontinued: false,
      position: 0,
      priceCents: null,
      weightGrams: null,
      // Elle ne peut pas se suivre elle-même : c'est ELLE, le défaut.
      regulatoryFollowsDefault: false,
      allergens: null,
      nutrition: null,
    });
  }

  /**
   * Une déclinaison **de plus** — jamais la première, jamais celle par défaut.
   *
   * Elle naît **alignée** sur la fiche réglementaire du défaut, et c'est le seul
   * état de naissance défendable : née nue, elle rendrait sa fiche impubliable
   * (invariant 7), et — sur un produit DÉJÀ en vente — elle partirait au canal
   * avec `allergens: null`, que le récepteur ne doit surtout pas lire comme
   * « sans allergène ». Se désaligner est ensuite un geste, qui oblige à
   * déclarer.
   *
   * Sans tarif : une seconde déclinaison existe précisément parce qu'elle se
   * vend autrement. Recopier le prix du défaut inventerait une décision
   * commerciale que personne n'a prise — et un prix faux se facture.
   */
  static open(input: {
    id: string;
    sku: Sku;
    name: LocalizedText;
    options: Readonly<Record<string, string>>;
    position: number;
  }): Variant {
    return new Variant({
      id: input.id,
      sku: input.sku.value,
      name: input.name,
      options: input.options,
      isDefault: false,
      isDiscontinued: false,
      position: input.position,
      priceCents: null,
      weightGrams: null,
      regulatoryFollowsDefault: true,
      allergens: null,
      nutrition: null,
    });
  }

  static reconstitute(snapshot: VariantSnapshot): Variant {
    return new Variant(snapshot);
  }

  get id(): string {
    return this.identity;
  }

  get sku(): string {
    return this.skuValue;
  }

  get isDefault(): boolean {
    return this.defaultFlag;
  }

  get isDiscontinued(): boolean {
    return this.discontinuedFlag;
  }

  get position(): number {
    return this.positionValue;
  }

  /** Suit-elle la fiche du défaut plutôt que d'en porter une ? */
  get regulatoryFollowsDefault(): boolean {
    return this.followsDefaultFlag;
  }

  /**
   * Invariant 7 : `[]` compte comme déclaré — c'est une affirmation positive.
   *
   * ⚠️ Ne répond que pour ELLE. Une déclinaison alignée n'en porte aucune, et
   * c'est l'agrégat — seul à voir le défaut — qui décide si elle est couverte.
   */
  get hasOwnRegulatorySheet(): boolean {
    return this.allergensValue !== null;
  }

  /**
   * S'aligne sur la fiche du défaut, ou reprend la sienne.
   *
   * Le geste ne touche **que le drapeau**. La fiche propre, si elle existait,
   * reste en place et dort : s'aligner puis se désaligner rend ce qu'on avait
   * écrit, plutôt que de le détruire au passage. Effacer aurait fait d'une case
   * à cocher une suppression de donnée réglementaire — et le geste inverse ne
   * l'aurait pas rendue.
   *
   * Une déclinaison alignée qui n'a jamais rien déclaré reste « non déclarée »
   * pour elle-même ; c'est l'agrégat qui la dit couverte, parce que lui seul
   * voit le défaut.
   */
  alignRegulatoryOnDefault(aligned: boolean): void {
    if (aligned && this.defaultFlag) {
      throw new DefaultVariantCannotFollowItselfError(this.skuValue);
    }
    this.followsDefaultFlag = aligned;
  }

  /**
   * Tarif et poids en un geste : c'est ainsi que le back-office les saisit.
   *
   * Un record plutôt que deux arguments positionnels : deux `number | null`
   * voisins qu'aucun compilateur ne distingue si on les intervertit. La même
   * raison a fait passer `VatRate.revise` au record.
   *
   * `priceCents` EST un prix public TTC — il n'y a plus d'assiette à côté pour
   * le dire, parce qu'il n'y a plus qu'une assiette. Le hors taxe se déduit du
   * taux de chaque canal, au moment de la projection.
   */
  price(input: VariantPricing): void {
    this.priceCentsValue = requireCountOrNull("priceCents", input.priceCents);
    this.weightGramsValue = requireCountOrNull("weightGrams", input.weightGrams);
  }

  snapshot(): VariantSnapshot {
    return {
      id: this.identity,
      sku: this.skuValue,
      name: this.nameValue,
      options: this.optionsValue,
      isDefault: this.defaultFlag,
      isDiscontinued: this.discontinuedFlag,
      position: this.positionValue,
      priceCents: this.priceCentsValue,
      weightGrams: this.weightGramsValue,
      regulatoryFollowsDefault: this.followsDefaultFlag,
      allergens: this.allergensValue,
      nutrition: this.nutritionValue,
    };
  }
}

/** Les centimes et les grammes sont des ENTIERS positifs — ou rien. */
function requireCountOrNull(field: string, value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidVariantPricingError(field, value);
  }
  return value;
}
