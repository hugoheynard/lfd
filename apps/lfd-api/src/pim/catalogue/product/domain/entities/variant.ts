import {
  DefaultVariantCannotFollowItselfError,
  InvalidVariantPricingError,
} from "../errors/product-errors.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type { Sku } from "../value-objects/sku.value-object.js";

/**
 * Ce que l'instantané rend sous `nutrition` : les valeurs pour 100 g — chaque
 * champ `null` = non renseigné — **et** les traces, qui n'y sont plus que par
 * le contrat servi au front (§6d du plan `plan-separer-allergenes-et-nutrition.md`).
 */
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

/**
 * **Les valeurs seules**, sans une trace ni un allergène — ce que la moitié
 * nutrition pose. Dérivée de l'instantané plutôt que recopiée : les deux ne
 * peuvent pas diverger, et le jour où `mayContain` sortira de la vue (§6d du
 * plan), les deux formes se rejoindront sans qu'on y touche.
 */
export type VariantNutritionValues = Omit<VariantNutritionSnapshot, "mayContain">;

/** Les valeurs quand personne n'en a saisi aucune — huit `null`, pas un zéro. */
const BLANK_NUTRITION: VariantNutritionSnapshot = {
  mayContain: [],
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
};

/**
 * Ce qu'une déclinaison peut **suivre** de celle par défaut, tel qu'on le
 * DEMANDE — la surface acceptée en écriture.
 *
 * Une union nommée et non des méthodes jumelles : le jour où une quatrième
 * section devient alignable, c'est une valeur de plus ici et une colonne de
 * plus en base — pas un chemin de plus à tenir d'accord avec les autres.
 *
 * Trois sections seulement, et c'est le MODÈLE qui le décide : l'identité, la
 * communication et les visuels sont portés par la fiche, donc une déclinaison
 * ne peut pas en diverger — il n'y a rien à aligner sur ce qu'on ne possède pas.
 */
export type VariantAspect = "regulatory" | "allergens" | "pricing" | "nutrition";

/**
 * Les drapeaux réellement PORTÉS — un par colonne, et trois pour quatre mots.
 *
 * `regulatory_follows_default` est devenue celle des allergènes le 2026-09-22
 * sans changer de nom : elle garde sa valeur et ses lecteurs, et n'en perd
 * qu'une moitié de sens (`plan-separer-allergenes-et-nutrition.md`, §6d).
 */
type VariantFlag = "regulatory" | "pricing" | "nutrition";

/**
 * 🔴 **Le seul endroit où `"regulatory"` et `"allergens"` se rejoignent.**
 *
 * Les valeurs de l'énumération s'AJOUTENT, on ne renomme pas : `"regulatory"`
 * est déjà posée dans des faits de journal que personne ne réécrira. Elle
 * désigne donc le drapeau des allergènes, exactement comme `"allergens"`.
 *
 * Plus aucun écran ne l'émet depuis le 2026-09-22 ; elle reste acceptée le
 * temps que la bascule du back-office soit en production, puisque les deux ne
 * se déploient pas ensemble. Le jour où elle se retire, cette table perd une
 * ligne et rien d'autre — résoudre la correspondance ailleurs (un `if` dans le
 * handler, un autre dans l'adaptateur) l'aurait rendue impossible à retirer
 * sans les retrouver tous.
 */
const ASPECT_FLAG: Readonly<Record<VariantAspect, VariantFlag>> = {
  regulatory: "regulatory",
  allergens: "regulatory",
  pricing: "pricing",
  nutrition: "nutrition",
};

export interface VariantSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
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
 * sans déclaration d'ALLERGÈNES sur chaque déclinaison active » — les valeurs
 * nutritionnelles n'entrent pas dans ce compte, voir
 * {@link declaresOwnAllergens}).
 *
 * La fiche réglementaire (`allergens` / `nutrition`) ne s'écrit ici que par ses
 * verbes, et elle se PERSISTE par deux ports dédiés — un par table
 * (`VariantAllergensRepository`, `NutritionValuesRepository`). La déclinaison la
 * porte pour que le produit puisse répondre « suis-je publiable ? » sans aller
 * la rechercher ailleurs.
 */
/** Ce que la section « Tarif & TVA » possède, pour une déclinaison. */
export interface VariantPricing {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
}

export class Variant {
  private readonly identity: string;
  private readonly skuValue: string;
  private nameValue: LocalizedText;
  private readonly optionsValue: Readonly<Record<string, string>>;
  private defaultFlag: boolean;
  private discontinuedFlag: boolean;
  private positionValue: number;
  private priceCentsValue: number | null;
  private weightGramsValue: number | null;
  private allergensValue: readonly string[] | null;
  private nutritionValue: VariantNutritionSnapshot | null;
  private readonly followsDefault: Record<VariantFlag, boolean>;

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
    this.followsDefault = {
      regulatory: snapshot.regulatoryFollowsDefault,
      pricing: snapshot.pricingFollowsDefault,
      nutrition: snapshot.nutritionFollowsDefault,
    };
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
      pricingFollowsDefault: false,
      nutritionFollowsDefault: false,
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
      // Les VALEURS naissent alignées pour la même raison que les allergènes :
      // née nue, la déclinaison afficherait un tableau vide là où celui du
      // défaut décrit la même pâte. Se désaligner est ensuite un geste.
      nutritionFollowsDefault: true,
      // Le TARIF, lui, ne s'aligne pas d'office : une seconde déclinaison
      // existe le plus souvent parce qu'elle se vend autrement, et un prix
      // hérité par défaut se facturerait sans que personne l'ait décidé.
      pricingFollowsDefault: false,
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

  /** Suit-elle les allergènes du défaut plutôt que d'en déclarer ? */
  get regulatoryFollowsDefault(): boolean {
    return this.followsDefault.regulatory;
  }

  /** Suit-elle les valeurs nutritionnelles du défaut plutôt que les siennes ? */
  get nutritionFollowsDefault(): boolean {
    return this.followsDefault.nutrition;
  }

  /** Suit-elle le tarif du défaut — prix et poids — plutôt que le sien ? */
  get pricingFollowsDefault(): boolean {
    return this.followsDefault.pricing;
  }

  follows(aspect: VariantAspect): boolean {
    return this.followsDefault[ASPECT_FLAG[aspect]];
  }

  /**
   * **Cette déclinaison déclare-t-elle SES allergènes ?** — et rien d'autre.
   *
   * `[]` compte comme déclaré : « aucun allergène » est une affirmation
   * positive, `null` est un silence. C'est le seul fait que l'invariant 7
   * regarde.
   *
   * 🔴 Le verbe s'appelait `hasOwnRegulatorySheet` et lisait déjà cette
   * colonne-ci : depuis que la fiche s'enregistre en deux moitiés, « fiche
   * réglementaire » désigne aussi les valeurs nutritionnelles, et le nom
   * laissait croire qu'elles comptaient. Elles ne comptent pas, et le
   * règlement (UE) n° 1169/2011 dit pourquoi — art. 9 §1 c) obligatoire, point
   * l) exempté par l'art. 44 §1 comme par l'annexe V pt 19
   * (`plan-separer-allergenes-et-nutrition.md`, D2).
   *
   * ⚠️ Ne répond que pour ELLE. Une déclinaison alignée n'en porte aucune, et
   * c'est l'agrégat — seul à voir le défaut — qui décide si elle est couverte.
   */
  get declaresOwnAllergens(): boolean {
    return this.allergensValue !== null;
  }

  /**
   * **La moitié « sécurité » seule** — ce que la déclinaison contient, et ses
   * traces. Les valeurs nutritionnelles restent ce qu'elles étaient.
   *
   * Deux verbes plutôt qu'un depuis le 2026-09-22 : la fiche s'enregistre par
   * deux gestes, et le verbe unique qui écrivait les deux moitiés obligeait
   * celui qui en écrivait une à fournir l'autre — c'est-à-dire à l'effacer s'il
   * l'oubliait. Sur les allergènes, l'oublier revenait à affirmer « aucun »
   * (plan `plan-separer-allergenes-et-nutrition.md`, bug 0c).
   *
   * Le verbe existe aussi pour que l'agrégat cesse d'être périmé après une
   * écriture : la fiche s'écrivait par un port sans jamais repasser par lui, si
   * bien que `declaresOwnAllergens` répondait sur l'état d'AVANT — or
   * l'invariant 7 se juge sur cet état, et il le lit juste après avoir déclaré.
   *
   * 🔴 **L'écriture reste au port dédié**, et ce n'est pas un oubli
   * (`plan-separer-allergenes-et-nutrition.md`, §6a). La confier à `save()`
   * — qui réécrit TOUTES les déclinaisons et compte douze appelants — ferait
   * qu'un renommage ou une publication écraserait une déclaration faite entre
   * temps. Le port dédié ne rend pas l'écriture sûre ; il fait qu'une écriture
   * ne peut plus en détruire une autre qu'elle ne visait pas.
   *
   * ⚠️ La validation, elle, n'est PAS ici : elle demande le référentiel des
   * allergènes, qui vit en base. Le domaine reçoit une déclaration déjà
   * construite par `allergenDeclaration()` — valide ou rien.
   *
   * ⚠️ Les traces atterrissent dans `nutritionValue` parce que l'instantané les
   * y porte encore — le contrat servi au front ne bouge pas dans ce lot (§6d).
   * En base, elles sont dans la table des allergènes depuis le lot 1.
   */
  declareAllergens(declaration: AllergenDeclaration): void {
    this.allergensValue = declaration.allergens;
    this.nutritionValue = {
      ...(this.nutritionValue ?? BLANK_NUTRITION),
      mayContain: declaration.mayContain,
    };
  }

  /**
   * **La moitié « valeurs » seule.** Les allergènes et les traces restent ce
   * qu'ils étaient — y compris `null`, qui veut dire « personne n'a déclaré ».
   *
   * C'est la garantie que ce chantier existe pour donner : enregistrer un
   * tableau nutritionnel ne peut pas fabriquer une affirmation d'allergène.
   */
  declareNutritionValues(values: VariantNutritionValues): void {
    this.nutritionValue = {
      mayContain: this.nutritionValue?.mayContain ?? [],
      ...values,
    };
  }

  /**
   * S'aligne sur le défaut pour CETTE section, ou reprend la sienne.
   *
   * Le geste ne touche **que le drapeau**. La fiche propre, si elle existait,
   * reste en place et dort : s'aligner puis se désaligner rend ce qu'on avait
   * écrit, plutôt que de le détruire au passage. Effacer aurait fait d'une case
   * à cocher une suppression de donnée réglementaire — et le geste inverse ne
   * l'aurait pas rendue.
   *
   * Une déclinaison alignée qui n'a jamais rien déclaré reste « non déclarée »
   * pour elle-même ; c'est l'agrégat qui la dit couverte, parce que lui seul
   * voit le défaut. Même partage pour le tarif : elle n'a pas de prix à elle,
   * et c'est l'instantané de l'agrégat qui y met celui du défaut.
   */
  alignOnDefault(aspect: VariantAspect, aligned: boolean): void {
    if (aligned && this.defaultFlag) {
      throw new DefaultVariantCannotFollowItselfError(this.skuValue);
    }
    this.followsDefault[ASPECT_FLAG[aspect]] = aligned;
  }

  /**
   * **Rebaptise l'article** — « Boîte de 220 g », pas le nom de la fiche.
   *
   * Le nom était `readonly` depuis l'origine, et c'est exactement ce qui a rendu
   * la faute invisible : on le SAISISSAIT à la création, la base le gardait, et
   * plus personne ne pouvait ni le lire à l'écran ni le corriger. Un champ
   * qu'on demande une fois puis qu'on n'affiche jamais est un champ qu'on
   * n'aurait pas dû demander.
   *
   * La référence, elle, reste immuable : elle est dictée au labo et voyage dans
   * les envois. Renommer n'est pas rebaptiser un article (`lint:sku-never-recycled`).
   */
  rename(name: LocalizedText): void {
    this.nameValue = name;
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
      regulatoryFollowsDefault: this.followsDefault.regulatory,
      pricingFollowsDefault: this.followsDefault.pricing,
      nutritionFollowsDefault: this.followsDefault.nutrition,
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

/**
 * Le drapeau d'une section, **lu sur un instantané** plutôt que sur l'entité.
 *
 * Pour l'appelant qui a relevé l'état d'AVANT et veut savoir si le geste change
 * quelque chose : l'entité, elle, porte déjà la nouvelle valeur. Exporté pour
 * que la correspondance `"regulatory"` → allergènes n'existe qu'ici.
 */
export function followsDefaultIn(snapshot: VariantSnapshot, aspect: VariantAspect): boolean {
  const flags: Record<VariantFlag, boolean> = {
    regulatory: snapshot.regulatoryFollowsDefault,
    pricing: snapshot.pricingFollowsDefault,
    nutrition: snapshot.nutritionFollowsDefault,
  };
  return flags[ASPECT_FLAG[aspect]];
}

/**
 * Recolle une moitié de fiche à l'autre — **les traces d'un côté, les valeurs
 * de l'autre**.
 *
 * Les deux moitiés s'alignent séparément, et `mayContain` est une déclaration
 * d'ALLERGÈNE : elle suit le drapeau des allergènes, jamais celui de la
 * nutrition. Sans ce recollage, une déclinaison qui suit le défaut sur ses
 * traces et porte ses propres valeurs aurait rendu l'un des deux à la place de
 * l'autre — c'est-à-dire une trace du mauvais article sur une étiquette.
 *
 * `null` des deux côtés = personne ne s'est prononcé ; c'est le seul cas où
 * l'instantané nutritionnel n'existe pas.
 */
export function composeNutrition(
  traces: VariantNutritionSnapshot | null,
  values: VariantNutritionSnapshot | null,
): VariantNutritionSnapshot | null {
  if (traces === null && values === null) {
    return null;
  }
  return { ...(values ?? BLANK_NUTRITION), mayContain: traces?.mayContain ?? [] };
}
