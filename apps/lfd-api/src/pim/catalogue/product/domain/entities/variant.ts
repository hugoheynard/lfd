import {
  DefaultVariantCannotFollowItselfError,
  InvalidVariantPricingError,
  ZeroPricePerKgError,
} from "../errors/product-errors.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import {
  SaleReferenceInUseError,
  SaleReferenceUsageUnknownError,
} from "../errors/sale-unit-errors.js";
import type { SaleUnitClearance } from "../value-objects/sale-reference-usage.js";
import { BlankVariantInternalLabelError } from "../errors/variant-label-errors.js";
import {
  DetachedVariantNotRestorableError,
  DormantSheetWouldWakeError,
  VariantAlreadyDiscontinuedError,
  VariantNotDiscontinuedError,
} from "../errors/variant-lifecycle-errors.js";
import {
  DefaultVariantCannotFollowMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../errors/min-quantity-errors.js";
import {
  isEmptyMinQuantities,
  sameMinQuantities,
  type MinQuantities,
} from "../value-objects/min-quantities.js";
import {
  PIECE_SALE_TERMS,
  saleTerms,
  type SaleTerms,
  type SaleUnit,
} from "../value-objects/sale-terms.js";

import {
  defaultSnapshotFrom,
  openedDefaultSnapshot,
  openedSnapshot,
  type OpenedVariantInput,
} from "./variant-snapshot-mapper.js";
import { ASPECT_FLAG, type VariantAspect, type VariantFlag } from "./variant-aspect.js";
import type {
  VariantAllergenSheetSnapshot,
  VariantNutritionSnapshot,
  VariantNutritionValues,
  VariantPricing,
  VariantSnapshot,
} from "./variant-snapshot.js";

export { followsDefaultIn, type VariantAspect } from "./variant-aspect.js";
export type {
  VariantAllergenSheetSnapshot,
  VariantNutritionSnapshot,
  VariantNutritionValues,
  VariantPricing,
  VariantSnapshot,
} from "./variant-snapshot.js";

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
export class Variant {
  private readonly identity: string;
  private readonly skuValue: string;
  private nameValue: LocalizedText;
  private internalLabelValue: string | null;
  private readonly optionsValue: Readonly<Record<string, string>>;
  private defaultFlag: boolean;
  private discontinuedFlag: boolean;
  private detachedToProductIdValue: string | null;
  private readonly detachedFromVariantIdValue: string | null;
  private positionValue: number;
  private priceCentsValue: number | null;
  private weightGramsValue: number | null;
  private proPriceMillicentsValue: number | null;
  private proPricePerKgMillicentsValue: number | null;
  private publicPricePerKgTtcCentsValue: number | null;
  private pricePerKgShownPublicFlag: boolean;
  private pricePerKgShownProFlag: boolean;
  private saleTermsValue: SaleTerms;
  private publishedFlag: boolean;
  private minQuantitiesValue: MinQuantities;
  private minQuantityFollowsDefaultFlag: boolean;
  private customRecipeFlag: boolean;
  private allergenSheetValue: VariantAllergenSheetSnapshot | null;
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
    this.internalLabelValue = snapshot.internalLabel ?? null;
    this.optionsValue = snapshot.options;
    this.defaultFlag = snapshot.isDefault;
    this.discontinuedFlag = snapshot.isDiscontinued;
    this.detachedToProductIdValue = snapshot.detachedToProductId ?? null;
    this.detachedFromVariantIdValue = snapshot.detachedFromVariantId ?? null;
    this.positionValue = snapshot.position;
    this.priceCentsValue = snapshot.priceCents;
    this.weightGramsValue = snapshot.weightGrams;
    this.proPriceMillicentsValue = snapshot.proPriceMillicents;
    this.proPricePerKgMillicentsValue = snapshot.proPricePerKgMillicents;
    this.publicPricePerKgTtcCentsValue = snapshot.publicPricePerKgTtcCents;
    this.pricePerKgShownPublicFlag = snapshot.pricePerKgShownPublic;
    this.pricePerKgShownProFlag = snapshot.pricePerKgShownPro;
    this.saleTermsValue = {
      saleUnit: snapshot.saleUnit,
      weightMinGrams: snapshot.weightMinGrams,
      weightStepGrams: snapshot.weightStepGrams,
    };
    this.publishedFlag = snapshot.hasBeenPublished;
    this.minQuantitiesValue = snapshot.minQuantities;
    this.minQuantityFollowsDefaultFlag = snapshot.minQuantityFollowsDefault;
    this.customRecipeFlag = snapshot.customRecipe ?? false;
    this.allergenSheetValue = snapshot.allergenSheet;
    this.nutritionValue = snapshot.nutrition;
    this.followsDefault = {
      regulatory: snapshot.regulatoryFollowsDefault,
      pricing: snapshot.pricingFollowsDefault,
      nutrition: snapshot.nutritionFollowsDefault,
    };
  }

  /** La déclinaison née avec son produit : par défaut, en tête, sans tarif, hors taxe ({@link openedDefaultSnapshot}). */
  static openDefault(input: { id: string; sku: Sku; name: LocalizedText }): Variant {
    return new Variant(openedDefaultSnapshot(input));
  }

  /** Une déclinaison **de plus** — jamais la première, jamais le défaut ({@link openedSnapshot}). */
  static open(input: OpenedVariantInput): Variant {
    return new Variant(openedSnapshot(input));
  }

  static reconstitute(snapshot: VariantSnapshot): Variant {
    return new Variant(snapshot);
  }

  /** Le défaut d'un produit **né d'une déclinaison détachée** ({@link defaultSnapshotFrom}). */
  static openDefaultFrom(
    resolved: VariantSnapshot,
    input: { id: string; sku: Sku; name: LocalizedText },
  ): Variant {
    return new Variant(defaultSnapshotFrom(resolved, input));
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
    return this.allergenSheetValue !== null;
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
   * ⚠️ Les traces atterrissent ICI, avec les allergènes, et non dans la
   * nutrition : une trace EST un allergène, en base comme dans l'instantané
   * depuis le lot 7 du plan.
   */
  declareAllergens(declaration: AllergenDeclaration): void {
    this.allergenSheetValue = {
      declared: declaration.allergens,
      mayContain: declaration.mayContain,
    };
  }

  /**
   * **La moitié « valeurs » seule.** Les allergènes et les traces restent ce
   * qu'ils étaient — y compris `null`, qui veut dire « personne n'a déclaré ».
   *
   * C'est la garantie que ce chantier existe pour donner : enregistrer un
   * tableau nutritionnel ne peut pas fabriquer une affirmation d'allergène.
   * Depuis le lot 7, elle est STRUCTURELLE — les deux moitiés ne se touchent
   * plus, il n'y a donc plus rien à préserver au passage.
   */
  declareNutritionValues(values: VariantNutritionValues): void {
    this.nutritionValue = values;
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
   * **Change le nom de BOUTIQUE de l'article** — « Boîte de 220 g », pas le nom de la fiche.
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
  renameForShop(name: LocalizedText): void {
    // Le libellé se FIGE au premier écart (§ 3) : tant qu'il n'est pas posé, il
    // se lit sur le nom de boutique, et changer celui-ci renommerait l'onglet.
    this.internalLabelValue ??= this.nameValue.fr;
    this.nameValue = name;
  }

  /**
   * Le **libellé interne** — l'onglet du référentiel, jamais la boutique (I5).
   * Le nom de boutique ne bouge pas : c'est lui que lisent le fil, le devis et
   * l'atelier.
   */
  renameInternalLabel(label: string): void {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      throw new BlankVariantInternalLabelError(this.skuValue);
    }
    this.internalLabelValue = trimmed;
  }

  /** Le libellé interne lu : le sien, sinon le français du nom de boutique. */
  get internalLabel(): string {
    return this.internalLabelValue ?? this.nameValue.fr;
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
  price(input: VariantPricing, clearance?: SaleUnitClearance): void {
    this.priceCentsValue = requireCountOrNull("priceCents", input.priceCents);
    this.weightGramsValue = requireCountOrNull("weightGrams", input.weightGrams);
    if (input.proPrice !== undefined) {
      this.proPriceMillicentsValue = input.proPrice?.millicents ?? null;
    }
    this.pricePerKg(input);
    this.changeSaleTerms(input, clearance);
  }

  /**
   * L'unité de vente, le pas et le minimum. L'unité change librement tant que
   * sa référence de vente n'a servi nulle part — même publiée
   * (`saisir-un-prix.md`, § 3) ; le pas et le
   * minimum, eux, restent réglables.
   *
   * `clearance` est la réponse du commerce, lue par le handler AVANT l'appel :
   * absente ou sans réponse, un changement d'unité est refusé.
   */
  private changeSaleTerms(input: VariantPricing, clearance: SaleUnitClearance | undefined): void {
    if (
      input.saleUnit === undefined &&
      input.weightMinGrams === undefined &&
      input.weightStepGrams === undefined
    ) {
      return;
    }
    const current = this.saleTermsValue;
    const saleUnit = input.saleUnit ?? current.saleUnit;
    // Le pas et le minimum suivent l'unité : en changer sans les nommer
    // repart de rien, plutôt que de traîner ceux de l'autre unité.
    const carried = saleUnit === current.saleUnit ? current : PIECE_SALE_TERMS;
    const next = saleTerms({
      saleUnit,
      weightMinGrams:
        input.weightMinGrams === undefined ? carried.weightMinGrams : input.weightMinGrams,
      weightStepGrams:
        input.weightStepGrams === undefined ? carried.weightStepGrams : input.weightStepGrams,
    });
    if (next.saleUnit !== current.saleUnit) {
      this.ensureUnused(clearance);
    }
    this.saleTermsValue = next;
  }

  /**
   * @throws {SaleReferenceUsageUnknownError} le commerce n'a pas répondu.
   * @throws {SaleReferenceInUseError} la référence a déjà servi.
   */
  private ensureUnused(clearance: SaleUnitClearance | undefined): void {
    if (clearance === undefined || !clearance.answered) {
      throw new SaleReferenceUsageUnknownError(
        this.skuValue,
        clearance === undefined ? undefined : clearance.cause,
      );
    }
    if (clearance.uses.length > 0) {
      throw new SaleReferenceInUseError(this.skuValue, clearance.uses);
    }
  }

  /** Suit-elle la quantité minimale du défaut plutôt que la sienne ? */
  get minQuantityFollowsDefault(): boolean {
    return this.minQuantityFollowsDefaultFlag;
  }

  /**
   * **Pose sa quantité minimale** — une paire pro/public, ou `"follow"` pour suivre
   * celle du défaut (`plan-quantite-minimale.md`, Q1).
   *
   * Poser une paire cesse de suivre ; suivre garde la paire propre, qui
   * dort — même promesse que {@link alignOnDefault} : se désaligner rend ce
   * qu'on avait écrit. Au poids, seule la paire vide passe : son minimum
   * est en grammes (Q3), et suivre celui d'un défaut à la pièce l'en
   * doterait en douce.
   *
   * La paire arrive déjà lue (`minQuantities`).
   *
   * @returns `false` quand elle le disait déjà.
   */
  changeMinQuantities(next: MinQuantities | "follow"): boolean {
    if (next === "follow") {
      if (this.defaultFlag) {
        throw new DefaultVariantCannotFollowMinQuantityError(this.skuValue);
      }
      this.refuseOnWeight(true);
      const changed = !this.minQuantityFollowsDefaultFlag;
      this.minQuantityFollowsDefaultFlag = true;
      return changed;
    }
    this.refuseOnWeight(!isEmptyMinQuantities(next));
    const changed =
      this.minQuantityFollowsDefaultFlag || !sameMinQuantities(this.minQuantitiesValue, next);
    this.minQuantitiesValue = next;
    this.minQuantityFollowsDefaultFlag = false;
    return changed;
  }

  private refuseOnWeight(setsSomething: boolean): void {
    if (setsSomething && this.saleTermsValue.saleUnit === "weight") {
      throw new MinQuantityOnWeightSaleError(this.skuValue);
    }
  }

  /** Une recette sur mesure ? */
  get customRecipe(): boolean {
    return this.customRecipeFlag;
  }

  /**
   * **La déclare sur mesure** — ou la rend ouverte. Le refus qui dépend de la
   * fiche (le défaut d'une fiche sans vignettes, V5) est celui de l'agrégat.
   *
   * @returns `false` quand elle le disait déjà.
   */
  declareCustomRecipe(customRecipe: boolean): boolean {
    if (this.customRecipeFlag === customRecipe) {
      return false;
    }
    this.customRecipeFlag = customRecipe;
    return true;
  }

  /** L'unité dans laquelle elle se vend — la sienne, jamais celle du défaut. */
  get saleUnit(): SaleUnit {
    return this.saleTermsValue.saleUnit;
  }

  /**
   * Inscrit qu'elle part à la vente. Irréversible : un retrait de la vente ne
   * rend pas ce qui a pu être commandé entre-temps.
   */
  markPublished(): void {
    this.publishedFlag = true;
  }

  /**
   * **La sort de la vente**, sans la supprimer (`plan-gestes-de-declinaison.md`,
   * D1). Irréversible ici : sa référence n'est jamais réattribuée, et les
   * commandes qui la citent gardent leur sens. Les refus qui dépendent de ses
   * sœurs (le défaut, la dernière vivante) sont ceux de l'agrégat.
   */
  discontinue(): void {
    if (this.discontinuedFlag) {
      throw new VariantAlreadyDiscontinuedError(this.skuValue);
    }
    this.discontinuedFlag = true;
  }

  /** L'archive en la disant devenue ce produit — le détachement (G2). */
  detachTo(productId: string): void {
    this.discontinue();
    this.detachedToProductIdValue = productId;
  }

  /** Le produit qu'elle est devenue, ou `null`. */
  get detachedToProductId(): string | null {
    return this.detachedToProductIdValue;
  }

  /**
   * **La remet en vente**, à son rang et sous sa référence d'origine. Refuse
   * une déclinaison devenue un produit : elle vit déjà sous une autre fiche, et
   * la remettre en vente vendrait deux fois le même article.
   * `detachedProductLabel` : le nom de ce produit, pour que le refus le dise
   * (l'agrégat n'en connaît que l'id).
   *
   * @throws {VariantNotDiscontinuedError} elle n'est pas archivée.
   * @throws {DetachedVariantNotRestorableError} elle est devenue un produit.
   */
  restore(detachedProductLabel?: string): void {
    if (!this.discontinuedFlag) {
      throw new VariantNotDiscontinuedError(this.skuValue);
    }
    if (this.detachedToProductIdValue !== null) {
      throw new DetachedVariantNotRestorableError(
        this.skuValue,
        this.detachedToProductIdValue,
        detachedProductLabel,
      );
    }
    this.discontinuedFlag = false;
  }

  /**
   * **Cède la place de défaut** (`plan-gestes-de-declinaison.md`, G4). Elle
   * garde tout ce qu'elle porte : un défaut ne suit rien, donc tout ce qu'elle
   * avait était déjà à elle.
   */
  demote(): void {
    this.defaultFlag = false;
  }

  /**
   * **Devient la déclinaison par défaut** (G4) — elle ne peut plus se suivre
   * elle-même (CHECK `product_variant_default_*_follows_itself`), donc chaque
   * moitié qu'elle suivait passe en PROPRE avec la valeur qu'elle voyait.
   *
   * `resolved` est son instantané RÉSOLU par la fiche AVANT la bascule : les
   * valeurs du défaut sortant y sont déjà substituées. Ce qu'elle ne suivait
   * pas reste tel quel. Le refus qui dépend de la fiche (l'archivée, celle qui
   * l'est déjà) est celui de l'agrégat.
   *
   * @throws {DormantSheetWouldWakeError} elle suit une moitié que le défaut n'a
   *   jamais déclarée, et en garde une ancienne à elle : la recevoir « vide »
   *   demanderait d'effacer cette saisie, et la garder la réveillerait.
   */
  promoteToDefault(resolved: VariantSnapshot): void {
    this.refuseDormantWake("allergens", this.followsDefault.regulatory, resolved.allergenSheet);
    this.refuseDormantWake("nutrition", this.followsDefault.nutrition, resolved.nutrition);
    if (this.followsDefault.pricing) {
      this.priceCentsValue = resolved.priceCents;
      this.weightGramsValue = resolved.weightGrams;
      this.proPriceMillicentsValue = resolved.proPriceMillicents;
      this.proPricePerKgMillicentsValue = resolved.proPricePerKgMillicents;
      this.publicPricePerKgTtcCentsValue = resolved.publicPricePerKgTtcCents;
      this.pricePerKgShownPublicFlag = resolved.pricePerKgShownPublic;
      this.pricePerKgShownProFlag = resolved.pricePerKgShownPro;
    }
    if (this.followsDefault.regulatory) {
      this.allergenSheetValue = resolved.allergenSheet;
    }
    if (this.followsDefault.nutrition) {
      this.nutritionValue = resolved.nutrition;
    }
    if (this.minQuantityFollowsDefaultFlag) {
      this.minQuantitiesValue = resolved.minQuantities;
    }
    this.followsDefault.regulatory = false;
    this.followsDefault.pricing = false;
    this.followsDefault.nutrition = false;
    this.minQuantityFollowsDefaultFlag = false;
    this.defaultFlag = true;
  }

  private refuseDormantWake(
    half: "allergens" | "nutrition",
    follows: boolean,
    seen: object | null,
  ): void {
    const own = half === "allergens" ? this.allergenSheetValue : this.nutritionValue;
    if (follows && seen === null && own !== null) {
      throw new DormantSheetWouldWakeError(this.skuValue, half);
    }
  }

  /**
   * Les prix au kilo, chacun indépendant de tout autre : un poids changé n'y
   * touche pas, rien ne les calcule. `> 0` : un kilo à zéro s'afficherait
   * « 0,00 € / kg ».
   */
  private pricePerKg(input: VariantPricing): void {
    if (input.proPricePerKg !== undefined) {
      this.proPricePerKgMillicentsValue = requirePositiveOrNull(
        "proPricePerKg",
        input.proPricePerKg?.millicents ?? null,
      );
    }
    if (input.publicPricePerKgTtcCents !== undefined) {
      this.publicPricePerKgTtcCentsValue = requirePositiveOrNull(
        "publicPricePerKgTtcCents",
        input.publicPricePerKgTtcCents,
      );
    }
    if (input.pricePerKgShownPublic !== undefined) {
      this.pricePerKgShownPublicFlag = input.pricePerKgShownPublic;
    }
    if (input.pricePerKgShownPro !== undefined) {
      this.pricePerKgShownProFlag = input.pricePerKgShownPro;
    }
  }

  /** A-t-elle un prix pro HT À ELLE — sans regarder le défaut ? */
  get hasOwnProPrice(): boolean {
    return this.proPriceMillicentsValue !== null;
  }

  snapshot(): VariantSnapshot {
    return {
      id: this.identity,
      sku: this.skuValue,
      name: this.nameValue,
      internalLabel: this.internalLabelValue,
      options: this.optionsValue,
      isDefault: this.defaultFlag,
      isDiscontinued: this.discontinuedFlag,
      detachedToProductId: this.detachedToProductIdValue,
      detachedFromVariantId: this.detachedFromVariantIdValue,
      position: this.positionValue,
      priceCents: this.priceCentsValue,
      weightGrams: this.weightGramsValue,
      proPriceMillicents: this.proPriceMillicentsValue,
      proPricePerKgMillicents: this.proPricePerKgMillicentsValue,
      publicPricePerKgTtcCents: this.publicPricePerKgTtcCentsValue,
      pricePerKgShownPublic: this.pricePerKgShownPublicFlag,
      pricePerKgShownPro: this.pricePerKgShownProFlag,
      ...this.saleTermsValue,
      hasBeenPublished: this.publishedFlag,
      minQuantities: this.minQuantitiesValue,
      minQuantityFollowsDefault: this.minQuantityFollowsDefaultFlag,
      customRecipe: this.customRecipeFlag,
      regulatoryFollowsDefault: this.followsDefault.regulatory,
      pricingFollowsDefault: this.followsDefault.pricing,
      nutritionFollowsDefault: this.followsDefault.nutrition,
      allergenSheet: this.allergenSheetValue,
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

/** Un prix au kilo est un entier STRICTEMENT positif — ou rien. */
function requirePositiveOrNull(field: string, value: number | null): number | null {
  const count = requireCountOrNull(field, value);
  if (count === 0) {
    throw new ZeroPricePerKgError(field);
  }
  return count;
}
