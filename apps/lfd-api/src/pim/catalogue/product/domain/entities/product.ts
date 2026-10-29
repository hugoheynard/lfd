import {
  ArchivedProductNotPublishableError,
  ArchivedProductNotWithdrawableError,
  InvalidProductVariantsError,
  NotArchivedProductNotRestorableError,
  ProductUnknownContextError,
  VariantNotFoundError,
  VariantNotInProductError,
} from "../errors/product-errors.js";
import {
  Variant,
  type VariantAspect,
  type VariantPricing,
  type VariantNutritionValues,
  type VariantSnapshot,
} from "./variant.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { SaleUnitClearance } from "../value-objects/sale-reference-usage.js";
import type { ProPriceHt } from "../value-objects/pro-price-ht.js";
import { NO_MIN_QUANTITIES, type MinQuantities } from "../value-objects/min-quantities.js";
import { effectiveAudience, type Audience } from "../../../shared/domain/value-objects/audience.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import { activationGapsOf, type ActivationGaps } from "../services/activation-gaps.js";
import {
  isCompliantForActivation,
  productCompliance,
  type ComplianceFinding,
} from "../services/product-compliance.js";
import { refusalOf } from "./activation-refusal.js";
import {
  DefaultVariantNotDetachableError,
  DefaultVariantNotDiscontinuableError,
  LastLiveVariantNotDiscontinuableError,
  DiscontinuedVariantNotDefaultableError,
  VariantAlreadyDefaultError,
  VariantAlreadyDiscontinuedError,
} from "../errors/variant-lifecycle-errors.js";
import { PricingAlignmentAcrossUnitsError } from "../errors/sale-unit-errors.js";
import type { CompletenessRules } from "../services/variant-completeness.js";

export type ProductKind = "daily" | "made_to_order" | "resale";
export type ProductStatus = "draft" | "published" | "archived";

/**
 * Ce qu'un verbe de cycle de vie a **réellement** fait.
 *
 * `false` = le produit y était déjà. Il n'y a alors rien à écrire, et surtout
 * **rien à journaliser** : le journal est la trace d'audit, et un fait
 * `product.unpublished` sur une fiche qui n'était pas en vente est un fait qui
 * n'a pas eu lieu. Trois des quatre verbes journalisaient inconditionnellement
 * (audit 2026-09-01).
 *
 * À distinguer d'une transition **impossible**, qui lève : « il y était déjà »
 * est un non-événement, « ça n'a pas de sens » est une erreur d'appelant.
 */
export type StatusChanged = boolean;

export interface ProductSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly variants: readonly VariantSnapshot[];
  /**
   * Les taux propres à CE produit, par clé de contexte — sa **dérogation** à sa
   * famille. Clé absente = il hérite, et c'est le cas courant.
   */
  readonly vatByContext: ContextVat;
  /**
   * **Vendu seulement pendant une opération** — la bûche, pas le croissant
   * (D3 de `documentation/operations-datees/architecture-operations-datees.md`).
   *
   * Un fait de la FICHE et non de la ligne d'opération : retirer la bûche de
   * Noël, masquer ou archiver Noël doit la rendre invisible, jamais la vendre
   * toute l'année.
   */
  readonly operationOnly: boolean;
  /**
   * **Demande le froid** — se conserve au réfrigérateur (lot 4 bis du plan de
   * préparation de tournée, v2-2). La livraison ne le charge qu'en bac
   * isotherme.
   *
   * `false` n'affirme rien : c'est l'état de toute fiche tant que personne n'a
   * dit qu'elle était froide, pas une déclaration « se conserve au sec ».
   */
  readonly requiresCold: boolean;
  /**
   * À qui la fiche vend quand elle ne suit pas sa famille. `null` = elle
   * hérite (C2 du plan `plan-catalogue-synchronise-par-audience.md`).
   */
  readonly audience: Audience | null;
  /**
   * La déclinaison dont il est né par détachement (`plan-gestes-de-declinaison.md`,
   * G2) ; `null` = né d'une création. Facultatif à la LECTURE (absent = `null`),
   * comme `VariantSnapshot.detachedToProductId` : l'agrégat le rend toujours.
   */
  readonly originVariantId?: string | null | undefined;
  /**
   * **Montrer chaque déclinaison en vignette** au rayon de la boutique
   * (`plan-declinaisons-en-vignette.md`, V1) ; `false` = seule la déclinaison
   * par défaut. Facultatif à la LECTURE (absent = `true`, la valeur de toute
   * fiche) : l'agrégat le rend toujours.
   */
  readonly variantsAsTiles?: boolean | undefined;
}

/**
 * Ouvrir un produit, c'est ouvrir **sa déclinaison par défaut avec lui**.
 * Les créer séparément ouvrirait une fenêtre où l'invariant 2 est faux.
 */
export interface NewProductInput {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly defaultVariant: { readonly id: string; readonly sku: Sku; readonly name: LocalizedText };
}

/**
 * **Le produit — l'agrégat, déclinaisons comprises.**
 *
 * Ce qu'il garantit :
 *
 * - **invariant 2** — au moins une déclinaison, et **exactement une** par
 *   défaut. Vérifié à l'ouverture ET à la reconstitution : une ligne
 *   incohérente se signale au chargement plutôt que de ressortir vers les
 *   canaux ;
 * - le **slug suit le nom**, comme pour la famille ;
 * - une déclinaison ne se tarife que si elle **appartient** au produit — sinon
 *   une requête forgée tariferait la variante d'un autre ;
 * - prix et poids sont des **entiers positifs ou nuls**. La route HTTP
 *   l'exigeait déjà (`z.number().int().min(0)`), le domaine non : un seed ou
 *   un import passait à côté.
 *
 * Ce qu'il ne voit pas, et qui reste aux handlers : que la famille visée
 * existe et n'est pas archivée, et que le SKU est libre dans l'espace global
 * (le registre est une autre table).
 */
export class Product {
  private constructor(
    private readonly identity: string,
    private readonly skuValue: string,
    private nameValue: LocalizedText,
    private slugValue: LocalizedText,
    private kindValue: ProductKind,
    private categoryIdValue: string,
    private statusValue: ProductStatus,
    private readonly variantList: Variant[],
    private vatByContextValue: ContextVat,
    private operationOnlyValue: boolean,
    private requiresColdValue: boolean,
    private audienceValue: Audience | null,
    private readonly originVariantIdValue: string | null = null,
    // Une fiche naît en montrant chaque déclinaison (Hugo, 2026-10-29) : le
    // comportement de base, qu'on décoche fiche par fiche.
    private variantsAsTilesValue = true,
  ) {}

  static open(input: NewProductInput): Product {
    return new Product(
      input.id,
      input.sku.value,
      input.name,
      slugOf(input.name),
      input.kind,
      input.categoryId,
      // Un produit naît INVISIBLE : c'est ce qui rend l'invariant 7 tenable.
      "draft",
      [Variant.openDefault(input.defaultVariant)],
      // Un produit naît SANS dérogation : il suit sa famille jusqu'à ce que
      // quelqu'un décide le contraire, et cette décision se voit.
      {},
      // Un produit naît COURANT : le réserver aux opérations est une décision
      // qu'on prend en le sachant, et qui se lit au journal.
      false,
      // Un produit naît SANS froid déclaré : le froid se dit, il ne se devine pas.
      false,
      // Un produit naît avec l'audience de sa famille : il en hérite.
      null,
    );
  }

  static reconstitute(snapshot: ProductSnapshot): Product {
    assertVariants(snapshot);
    return new Product(
      snapshot.id,
      snapshot.sku,
      snapshot.name,
      snapshot.slug,
      snapshot.kind,
      snapshot.categoryId,
      snapshot.status,
      snapshot.variants.map((variant) => Variant.reconstitute(variant)),
      snapshot.vatByContext,
      snapshot.operationOnly,
      snapshot.requiresCold,
      snapshot.audience,
      snapshot.originVariantId ?? null,
      snapshot.variantsAsTiles ?? true,
    );
  }

  get id(): string {
    return this.identity;
  }

  get sku(): string {
    return this.skuValue;
  }

  get status(): ProductStatus {
    return this.statusValue;
  }

  get categoryId(): string {
    return this.categoryIdValue;
  }

  /** Les taux propres au produit — sa dérogation. Vide = il hérite. */
  get vatByContext(): ContextVat {
    return this.vatByContextValue;
  }

  /**
   * Déroge au taux de la famille, ou **revient à l'héritage**.
   *
   * Une carte vide n'est pas une dérogation vide : c'est le retour au taux de
   * la famille, et c'est ce qui rend le geste réversible sans écrire un état
   * « pas de dérogation » qui ressemblerait à une décision.
   *
   * Un seul refus : le contexte doit exister (registre). Un contexte que la
   * fiche ne vend pas se règle — la matrice ne décide plus de la TVA.
   */
  setVat(vat: ContextVat, contexts: readonly SalesContext[]): void {
    const known = new Set(contexts.map((context) => context.key));
    for (const key of Object.keys(vat)) {
      if (!known.has(key)) {
        throw new ProductUnknownContextError(key);
      }
    }
    this.vatByContextValue = { ...vat };
  }

  /** Vendu seulement pendant une opération ? */
  get operationOnly(): boolean {
    return this.operationOnlyValue;
  }

  /**
   * **Réserve la fiche aux opérations** — ou la rend à la vente courante.
   *
   * Aucune règle ne refuse le geste, et c'est voulu : une fiche archivée ou en
   * brouillon peut se préparer pour Noël. Ce que le drapeau change se juge chez
   * ceux qui VENDENT (D5), pas ici.
   *
   * @returns `false` quand la fiche y était déjà — rien à écrire au journal,
   * comme pour un statut ({@link StatusChanged}).
   */
  reserveForOperations(operationOnly: boolean): boolean {
    if (this.operationOnlyValue === operationOnly) {
      return false;
    }
    this.operationOnlyValue = operationOnly;
    return true;
  }

  /** Demande le froid ? */
  get requiresCold(): boolean {
    return this.requiresColdValue;
  }

  /**
   * **Déclare que la fiche demande le froid** — ou le retire.
   *
   * Aucune règle ne refuse le geste : une fiche en brouillon ou archivée se
   * prépare comme les autres. Ce que le froid change se juge chez ceux qui
   * CHARGENT (la livraison), pas ici.
   *
   * @returns `false` quand la fiche le disait déjà — rien à écrire au journal
   * ({@link StatusChanged}).
   */
  declareColdRequirement(requiresCold: boolean): boolean {
    if (this.requiresColdValue === requiresCold) {
      return false;
    }
    this.requiresColdValue = requiresCold;
    return true;
  }

  /** Montre-t-il chaque déclinaison en vignette ? */
  get variantsAsTiles(): boolean {
    return this.variantsAsTilesValue;
  }

  /**
   * **Montre chaque déclinaison en vignette** au rayon — ou seulement la
   * déclinaison par défaut (`plan-declinaisons-en-vignette.md`, V1).
   *
   * Aucune règle ne refuse le geste : une fiche à une seule déclinaison le
   * porte sans effet, et le prend dès qu'on lui en ajoute une. Ce que l'option
   * change se juge chez ceux qui VENDENT (la vitrine), pas ici.
   *
   * @returns `false` quand la fiche le disait déjà ({@link StatusChanged}).
   */
  showVariantsAsTiles(variantsAsTiles: boolean): boolean {
    if (this.variantsAsTilesValue === variantsAsTiles) {
      return false;
    }
    this.variantsAsTilesValue = variantsAsTiles;
    return true;
  }

  /** Sa propre audience, ou `null` s'il suit sa famille. */
  get audience(): Audience | null {
    return this.audienceValue;
  }

  /**
   * Élargit ou restreint à qui la fiche vend — ou la rend à sa famille avec
   * `null`. Aucun refus : comme le froid, ce que l'audience change se juge à
   * l'activation et chez ceux qui vendent.
   *
   * @returns `false` quand elle le disait déjà ({@link StatusChanged}).
   */
  changeAudience(audience: Audience | null): boolean {
    if (this.audienceValue === audience) {
      return false;
    }
    this.audienceValue = audience;
    return true;
  }

  /**
   * **La quantité minimale d'une déclinaison** — son minimum pro et son
   * minimum public, ou `"follow"` pour suivre le défaut
   * (`plan-quantite-minimale.md`, M1). Par audience seulement (Q2) : aucun
   * contexte de vente à vérifier.
   *
   * @returns `false` quand la déclinaison le disait déjà.
   */
  changeMinQuantities(variantId: string, next: MinQuantities | "follow"): boolean {
    return this.variant(variantId).changeMinQuantities(next);
  }

  /** Renomme — et re-dérive le slug. */
  rename(name: LocalizedText): void {
    this.nameValue = name;
    this.slugValue = slugOf(name);
  }

  changeKind(kind: ProductKind): void {
    this.kindValue = kind;
  }

  /** Range le produit dans une autre famille (`ReclassifyProduct`). */
  reclassify(categoryId: string): void {
    this.categoryIdValue = categoryId;
  }

  /**
   * **Invariant 7, tel que le lot 2b le tient** : on ne met pas en vente ce
   * qu'on ne peut pas étiqueter — mais le refus se fait désormais **par
   * construction**, déclinaison par déclinaison, et non sur la fiche entière.
   *
   * Activer exige **au moins une déclinaison non arrêtée complète** (C1 et 2b3
   * de `plan-catalogue-synchronise-par-audience.md`) : un prix public, un prix
   * pro HT saisi (seule source depuis le lot R3), et un taux pour chaque
   * contexte de vente en service. Les allergènes ne refusent plus rien depuis
   * le 2026-10-27 (`plan-allergenes-jamais-bloquants.md`) : la composition
   * corrige la déclaration servie, l'absence de déclaration se sert par
   * précaution (`effective-allergens.ts`). Les autres
   * déclinaisons n'empêchent rien : la projection des faits ET l'envoi actuel
   * (`variant_sans_allergenes`) les écartent de la vente — c'est ce qui rend
   * l'assouplissement sûr, et c'est pourquoi il n'a pas été fait avant.
   *
   * 🔴 **Les valeurs nutritionnelles n'entrent PAS dans ce compte**, et ce n'est
   * pas un desserrage : le règlement (UE) n° 1169/2011 rend les allergènes
   * obligatoires (art. 9 §1 point c) et exempte la déclaration nutritionnelle
   * (point l) dans les deux cas de vente de La Folie Coffee
   * (`plan-separer-allergenes-et-nutrition.md`, D2, vérifié le 2026-09-22).
   *
   * Un produit archivé se restaure d'abord : passer d'« retiré de la vente » à
   * « en ligne » d'un seul geste ferait sauter l'étape où quelqu'un regarde.
   *
   * Le jugement porte sur les déclinaisons RÉSOLUES : une alignée porte le prix
   * et la déclaration du défaut qu'elle suit. Taux et contextes arrivent
   * résolus : ils dépendent de registres que la fiche ne voit pas.
   */
  /**
   * **Ce qui manque pour activer**, sans rien muter — le même jugement que
   * `activate` refuse (elle l'appelle), pour que la liste dise « activable »
   * avec exactement le code qui accepte ou refuse le geste.
   *
   * Jugé sur les déclinaisons RÉSOLUES, quel que soit le statut : le statut
   * est l'affaire de {@link Product.isActivatableWith}.
   */
  activationGapsWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): ActivationGaps {
    return activationGapsOf(
      this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience),
    );
  }

  /**
   * **Le jugement unique** de la fiche ({@link productCompliance}) — tous ses
   * constats, bloquants et avertissements, quel que soit son statut.
   * `citedAllergens` : ce que portent les ingrédients qu'elle cite, résolu par
   * le handler ; `categoryAudience` : celle de sa famille, dont elle hérite si
   * elle n'en pose pas — un prix n'est exigé que pour l'audience visée.
   */
  complianceWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): ComplianceFinding[] {
    return productCompliance(
      this.resolvedVariants(),
      vatPercents,
      rules,
      citedAllergens,
      effectiveAudience(this.audienceValue, categoryAudience),
    );
  }

  /**
   * Les déclinaisons **résolues** — une alignée porte la déclaration du défaut.
   * La seule résolution du référentiel : le jugement et l'encart de
   * composition la lisent tous deux, pour ne jamais diverger.
   */
  resolvedVariants(): VariantSnapshot[] {
    return this.variantList.map((variant) => this.resolvedSnapshot(variant));
  }

  /**
   * Une activation **changerait-elle** la fiche ? Vrai seulement pour un
   * brouillon complet. Une fiche publiée rend `false` (l'activer ne fait rien,
   * elle n'est pas « à activer »), une archivée aussi (`activate` la refuse :
   * elle se restaure d'abord). Choix du 2026-10-26 : le filtre « Activables »
   * de la liste ne montre que ce que « Activer » ferait passer en vente.
   */
  isActivatableWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): boolean {
    return (
      this.statusValue === "draft" &&
      isCompliantForActivation(
        this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience),
      )
    );
  }

  activate(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): StatusChanged {
    if (this.statusValue === "archived") {
      throw new ArchivedProductNotPublishableError(this.identity);
    }
    if (this.statusValue === "published") {
      return false;
    }
    const findings = this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience);
    if (!isCompliantForActivation(findings)) {
      throw refusalOf(this.identity, findings);
    }
    this.statusValue = "published";
    // Toutes partent avec la fiche : c'est ce qui fige leur unité de vente.
    for (const variant of this.variantList) {
      variant.markPublished();
    }
    return true;
  }

  /**
   * Retire de la vente en ligne, sans archiver : le produit redevient brouillon.
   *
   * Refuse sur un produit **archivé** : il n'est pas en vente, il est sorti du
   * catalogue, et « le retirer de la vente » ne veut rien dire. Le refus n'est
   * pas de la rigueur gratuite — c'est ici que le front envoyait sa demande de
   * RESTAURATION (audit 2026-09-01, §1). Le verbe ne faisait rien, le handler
   * journalisait quand même, et l'écran peignait « Brouillon » sur une fiche
   * restée archivée. Un no-op silencieux avait donc l'exacte apparence d'un
   * succès.
   */
  deactivate(): StatusChanged {
    if (this.statusValue === "archived") {
      throw new ArchivedProductNotWithdrawableError(this.identity);
    }
    if (this.statusValue !== "published") {
      return false;
    }
    this.statusValue = "draft";
    return true;
  }

  /**
   * Retire de la vente sans supprimer. Idempotent — l'archivage en lot passe par
   * là, et une sélection contient couramment ce qui l'est déjà.
   */
  archive(): StatusChanged {
    if (this.statusValue === "archived") {
      return false;
    }
    this.statusValue = "archived";
    return true;
  }

  /**
   * Remet un produit archivé en brouillon — jamais directement en ligne.
   *
   * Refuse sur un produit qui n'est pas archivé. Sans ce refus, restaurer un
   * produit **en ligne** le rétrogradait silencieusement en brouillon : le
   * verbe posait `draft` sans regarder d'où il venait, et le produit sortait de
   * la vente sur un geste qui prétendait l'y ramener.
   */
  restore(): StatusChanged {
    if (this.statusValue !== "archived") {
      throw new NotArchivedProductNotRestorableError(this.identity, this.statusValue);
    }
    this.statusValue = "draft";
    return true;
  }

  /**
   * Renomme une déclinaison **du produit**.
   *
   * Le passage par l'agrégat n'est pas de la cérémonie : c'est lui qui refuse
   * de renommer la déclinaison d'une AUTRE fiche, et une requête forgée sur le
   * seul identifiant de déclinaison n'a donc aucun effet ici. Ici, le nom de
   * BOUTIQUE — qui fige le libellé au premier écart.
   */
  renameVariantForShop(variantId: string, name: LocalizedText): void {
    this.variant(variantId).renameForShop(name);
  }

  /** Le libellé interne LU d'une déclinaison — le sien, sinon son nom de boutique en français. */
  variantInternalLabel(variantId: string): string {
    return this.variant(variantId).internalLabel;
  }

  /** Le libellé INTERNE d'une déclinaison — le nom de boutique ne bouge pas. */
  renameVariantInternalLabel(variantId: string, label: string): void {
    this.variant(variantId).renameInternalLabel(label);
  }

  /** Tarif et poids d'une déclinaison **du produit**. */
  priceVariant(variantId: string, pricing: VariantPricing, clearance?: SaleUnitClearance): void {
    this.variant(variantId).price(pricing, clearance);
    this.assertPricingUnitsAgree();
  }

  /**
   * Une déclinaison qui suit le tarif du défaut se vend dans la même unité
   * que lui : sinon le prix au kilo du défaut deviendrait le prix d'une de ses
   * pièces. Tenu après chaque geste qui touche l'unité ou l'alignement.
   */
  private assertPricingUnitsAgree(): void {
    const unit = this.defaultVariant.saleUnit;
    const stray = this.variantList.find(
      (variant) => variant.pricingFollowsDefault && variant.saleUnit !== unit,
    );
    if (stray !== undefined) {
      throw new PricingAlignmentAcrossUnitsError(stray.sku);
    }
  }

  /**
   * **Pré-remplit le prix pro HT** d'une déclinaison (lot P, P5) — et
   * seulement là où rien n'est saisi.
   *
   * Deux refus silencieux, tenus ICI plutôt que dans le handler : une
   * déclinaison qui suit le tarif du défaut n'a pas de prix à elle (lui en
   * écrire un dormirait sous le drapeau et se réveillerait au désalignement),
   * et une saisie existante ne s'écrase jamais. Rend `true` si la déclinaison
   * a changé.
   */
  prefillProPrice(variantId: string, price: ProPriceHt): boolean {
    const target = this.variant(variantId);
    if (target.pricingFollowsDefault || target.hasOwnProPrice) {
      return false;
    }
    const own = target.snapshot();
    target.price({ priceCents: own.priceCents, weightGrams: own.weightGrams, proPrice: price });
    return true;
  }

  /**
   * **Les allergènes d'une déclinaison**, sans toucher à ses valeurs.
   *
   * La moitié qui engage la sécurité du mangeur.
   *
   * Refuse si la déclinaison n'est pas la sienne — c'est l'agrégat qui dit ce
   * qui lui appartient, pas une requête sur l'id seul.
   *
   * 🔴 Ce verbe ne PERSISTE rien : l'écriture reste au port dédié
   * (`plan-separer-allergenes-et-nutrition.md`, §6a). Il existe pour que
   * l'agrégat porte l'état qu'il est seul à savoir juger — `activate` juge la
   * déclinaison RÉSOLUE contre son défaut, et il le fait sur l'état d'APRÈS.
   */
  declareAllergens(variantId: string, declaration: AllergenDeclaration): void {
    this.variant(variantId).declareAllergens(declaration);
  }

  /** **Les valeurs d'une déclinaison**, sans toucher à ses allergènes. */
  declareNutritionValues(variantId: string, values: VariantNutritionValues): void {
    this.variant(variantId).declareNutritionValues(values);
  }

  /**
   * Refuse si la déclinaison n'est pas du produit. Utile aux verbes dont
   * l'écriture passe par un satellite (la fiche réglementaire) : c'est
   * l'agrégat qui dit ce qui lui appartient, pas une requête sur l'id seul.
   */
  requireVariant(variantId: string): void {
    this.variant(variantId);
  }

  private variant(variantId: string): Variant {
    const found = this.variantList.find((candidate) => candidate.id === variantId);
    if (found === undefined) {
      throw new VariantNotFoundError(this.identity, variantId);
    }
    return found;
  }

  /**
   * **La déclinaison par défaut** — l'invariant 2 garantit qu'il y en a une.
   *
   * Le `?? this.variantList[0]` n'est pas une prudence de plus : `at()` rend
   * `T | undefined` quel que soit l'invariant, et le compilateur ne lit pas les
   * garanties écrites en prose.
   */
  private get defaultVariant(): Variant {
    return this.variantList.find((variant) => variant.isDefault) ?? this.variantList[0]!;
  }

  /**
   * **Archive une déclinaison** — `is_discontinued`, hors vente, en base pour
   * toujours (`plan-gestes-de-declinaison.md`, D1).
   *
   * Elle RESTE dans l'agrégat : son rang reste pris ({@link nextVariantPosition}),
   * si bien que la suivante prend `-3` après un `-2` archivé, et jamais `-2-2`.
   * Ce sont les lectures (fiche, faits du catalogue) qui l'écartent.
   *
   * @throws {DefaultVariantNotDiscontinuableError} le défaut, tant qu'il en reste d'autres.
   * @throws {LastLiveVariantNotDiscontinuableError} la dernière vivante : c'est la fiche qu'on archive.
   * @throws {VariantAlreadyDiscontinuedError} déjà archivée.
   */
  discontinueVariant(variantId: string): void {
    const target = this.variant(variantId);
    if (target.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(target.sku);
    }
    const othersAlive = this.variantList.some(
      (variant) => variant.id !== variantId && !variant.isDiscontinued,
    );
    if (!othersAlive) {
      throw new LastLiveVariantNotDiscontinuableError(target.sku);
    }
    if (target.isDefault) {
      throw new DefaultVariantNotDiscontinuableError(target.sku);
    }
    target.discontinue();
  }

  /**
   * **Fait d'une déclinaison un produit** (`plan-gestes-de-declinaison.md`,
   * D2 et D3) : le nouveau produit naît de ce qu'elle VOYAIT — sa vue résolue,
   * plus la famille, le genre, la TVA, l'audience, le froid et l'opération de
   * la fiche — et l'origine l'archive dans le même geste.
   *
   * Il naît **brouillon** : un produit neuf n'a jamais été relu sous sa
   * nouvelle référence. Le nom du produit est celui de la déclinaison.
   *
   * @throws {DefaultVariantNotDetachableError} le défaut porte la fiche.
   * @throws {VariantAlreadyDiscontinuedError} une archivée ne se détache pas.
   */
  detachVariant(
    variantId: string,
    input: { id: string; sku: Sku; defaultVariant: { id: string; sku: Sku } },
  ): Product {
    const target = this.variant(variantId);
    if (target.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(target.sku);
    }
    if (target.isDefault) {
      throw new DefaultVariantNotDetachableError(target.sku);
    }
    const resolved = this.resolvedSnapshot(target);
    target.detachTo(input.id);
    return new Product(
      input.id,
      input.sku.value,
      resolved.name,
      slugOf(resolved.name),
      this.kindValue,
      this.categoryIdValue,
      "draft",
      [Variant.openDefaultFrom(resolved, { ...input.defaultVariant, name: resolved.name })],
      { ...this.vatByContextValue },
      this.operationOnlyValue,
      this.requiresColdValue,
      this.audienceValue,
      variantId,
    );
  }

  /**
   * **Désarchive une déclinaison** — elle reprend son rang et sa référence, et
   * revient en vente selon l'état de la fiche. Refuse celle devenue un produit.
   *
   * @param detachedProductLabel le nom du produit qu'elle est devenue, s'il y
   *   en a un, pour que le refus le dise.
   * @throws {VariantNotDiscontinuedError} elle n'est pas archivée.
   * @throws {DetachedVariantNotRestorableError} elle est devenue un produit.
   */
  restoreVariant(variantId: string, detachedProductLabel?: string): void {
    this.variant(variantId).restore(detachedProductLabel);
  }

  /**
   * **Fait d'une déclinaison la déclinaison par défaut** (`plan-gestes-de-declinaison.md`,
   * G4). Le cœur du geste est ce qui SUIT le défaut :
   *
   * - les sœurs qui suivaient l'ancien défaut (tarif, allergènes, nutrition,
   *   minimum) suivent désormais la nouvelle — rien à écrire chez elles, le
   *   lien est vivant ({@link resolvedSnapshot}) ;
   * - la nouvelle ne peut pas se suivre elle-même : elle reçoit en PROPRE les
   *   valeurs qu'elle voyait, drapeaux remis à `false` ({@link Variant.promoteToDefault}) ;
   * - l'ancienne garde ses valeurs : un défaut ne suivait rien.
   *
   * Tenu après la bascule : une sœur qui suit le tarif se vend dans l'unité
   * du nouveau défaut ({@link assertPricingUnitsAgree}).
   *
   * @returns l'ancien défaut, et les moitiés de fiche réglementaire que la
   *   nouvelle a reçues en propre — elles se persistent par leurs ports dédiés.
   * @throws {VariantAlreadyDefaultError} elle l'est déjà.
   * @throws {DiscontinuedVariantNotDefaultableError} elle est archivée.
   * @throws {DormantSheetWouldWakeError} cf. {@link Variant.promoteToDefault}.
   * @throws {PricingAlignmentAcrossUnitsError} une sœur suivrait un tarif d'une autre unité.
   */
  makeVariantDefault(variantId: string): DefaultVariantChange {
    const target = this.variant(variantId);
    if (target.isDefault) {
      throw new VariantAlreadyDefaultError(target.sku);
    }
    if (target.isDiscontinued) {
      throw new DiscontinuedVariantNotDefaultableError(target.sku);
    }
    const previous = this.defaultVariant;
    const resolved = this.resolvedSnapshot(target);
    const inherited = {
      allergens: target.follows("allergens"),
      nutrition: target.follows("nutrition"),
    };
    target.promoteToDefault(resolved);
    previous.demote();
    this.assertPricingUnitsAgree();
    return { previousDefaultId: previous.id, inherited };
  }

  /** Le produit qu'une déclinaison de la fiche est devenue, ou `null`. */
  detachedProductOf(variantId: string): string | null {
    return this.variant(variantId).detachedToProductId;
  }

  /**
   * Ajoute une déclinaison — **jamais la première**, jamais celle par défaut.
   *
   * Elle prend le rang suivant, et sa fiche réglementaire suit celle du défaut :
   * une déclinaison née nue rendrait le produit impubliable, et sur un produit
   * déjà en vente elle partirait au canal sans allergènes déclarés.
   *
   * @returns la déclinaison ouverte — l'appelant a besoin de son id et de son SKU.
   */
  addVariant(input: {
    id: string;
    sku: Sku;
    name: LocalizedText;
    options: Readonly<Record<string, string>>;
  }): Variant {
    const variant = Variant.open({ ...input, position: this.nextVariantPosition });
    // Sur une fiche en vente, elle part au prochain envoi : déjà publiée.
    if (this.statusValue === "published") {
      variant.markPublished();
    }
    this.variantList.push(variant);
    return variant;
  }

  /**
   * Le rang de la prochaine déclinaison — jamais leur nombre.
   *
   * Public parce que la RÉFÉRENCE en dérive (`P-XXXXXX-3`) et qu'elle se
   * fabrique avant l'ajout, contre le registre. Le compter au dehors — un
   * `count` en base, la longueur d'une liste — rouvrirait la porte à deux `-2`
   * sous la même fiche le jour où une déclinaison est retirée du milieu : seul
   * le registre les refuserait, et trop tard pour le dire bien.
   */
  get nextVariantPosition(): number {
    return (
      this.variantList.reduce((highest, variant) => Math.max(highest, variant.position), -1) + 1
    );
  }

  /**
   * Aligne une déclinaison sur la fiche du défaut, ou l'en détache.
   *
   * L'appartenance est tenue ici — une requête forgée ne peut pas aligner la
   * déclinaison d'un autre produit, exactement comme pour le tarif.
   */
  alignVariant(variantId: string, aspect: VariantAspect, aligned: boolean): void {
    const variant = this.variantList.find((candidate) => candidate.id === variantId);
    if (variant === undefined) {
      throw new VariantNotInProductError(this.identity, variantId);
    }
    variant.alignOnDefault(aspect, aligned);
    this.assertPricingUnitsAgree();
  }

  /**
   * Ce que le défaut prête à une déclinaison alignée, section par section.
   *
   * Trois sections depuis le 2026-09-22, et la fiche réglementaire en fait deux
   * à elle seule : ses moitiés s'enregistrent séparément, donc elles s'héritent
   * séparément. Une déclinaison peut porter ses propres valeurs nutritionnelles
   * tout en suivant les allergènes du défaut — c'est le cas courant d'un format
   * différent de la même pâte.
   *
   * Le prix et le poids voyagent ENSEMBLE, jamais l'un sans l'autre : un prix
   * hérité au-dessus d'un poids propre décrirait un article que personne ne
   * vend, et c'est le couple que la section « Tarif » enregistre.
   */
  private resolvedSnapshot(variant: Variant): VariantSnapshot {
    const own = variant.snapshot();
    const source = this.defaultVariant.snapshot();
    // Chaque moitié vient EN ENTIER de celui que SON drapeau désigne. Les
    // traces « peut contenir » voyagent avec les allergènes et non avec les
    // valeurs : ce sont des allergènes, et les faire suivre le mauvais drapeau
    // mettrait sur une étiquette la trace d'un autre article (plan §5). Depuis
    // le lot 7, rien ne se recolle plus ici — les deux moitiés sont deux
    // champs, et prendre l'un pour l'autre demanderait de le vouloir.
    const allergensFrom = variant.follows("allergens") ? source : own;
    const valuesFrom = variant.follows("nutrition") ? source : own;
    const pricing = variant.follows("pricing")
      ? {
          priceCents: source.priceCents,
          weightGrams: source.weightGrams,
          proPriceMillicents: source.proPriceMillicents,
          proPricePerKgMillicents: source.proPricePerKgMillicents,
          publicPricePerKgTtcCents: source.publicPricePerKgTtcCents,
        }
      : {};
    return {
      ...own,
      allergenSheet: allergensFrom.allergenSheet,
      nutrition: valuesFrom.nutrition,
      ...pricing,
      minQuantities: effectiveMinQuantities(own, source),
    };
  }

  /**
   * L'instantané, **fiches réglementaires résolues**.
   *
   * Une déclinaison alignée sort d'ici avec les allergènes du défaut, pas avec
   * `null`. C'est le seul endroit où le faire : tout ce qui consomme le
   * référentiel — la projection des canaux, l'empreinte de révision, le rapport
   * de parité — lit cet instantané, et résoudre l'héritage chez chacun d'eux
   * finirait par donner trois réponses.
   */
  snapshot(): ProductSnapshot {
    return { ...this.head(), variants: this.variantList.map((v) => this.resolvedSnapshot(v)) };
  }

  /**
   * L'instantané **non résolu** — chaque déclinaison avec ce qu'elle PORTE.
   *
   * 🔴 C'est celui qu'on PERSISTE, et la distinction n'est pas cosmétique.
   * {@link snapshot} résout l'héritage : une déclinaison alignée en sort avec le
   * prix et la fiche du défaut. Écrire CE tableau-là dans ses colonnes propres
   * recopierait le défaut chez elle, et détruirait ce qu'elle avait — alors que
   * {@link Variant.follows} promet l'inverse : « s'aligner puis se désaligner
   * rend ce qu'on avait écrit ».
   *
   * Les lecteurs n'y perdent rien : ils passent tous par l'agrégat
   * (`CatalogueReader.publishable` fait `listAll().map(p => p.snapshot())`) et
   * reçoivent donc la résolution **à la lecture**, là où elle doit vivre.
   */
  persistenceSnapshot(): ProductSnapshot {
    return { ...this.head(), variants: this.variantList.map((variant) => variant.snapshot()) };
  }

  /** Ce que les deux instantanés partagent — tout sauf les déclinaisons. */
  private head(): Omit<ProductSnapshot, "variants"> {
    return {
      id: this.identity,
      sku: this.skuValue,
      name: this.nameValue,
      slug: this.slugValue,
      kind: this.kindValue,
      categoryId: this.categoryIdValue,
      status: this.statusValue,
      vatByContext: this.vatByContextValue,
      operationOnly: this.operationOnlyValue,
      requiresCold: this.requiresColdValue,
      audience: this.audienceValue,
      originVariantId: this.originVariantIdValue,
      variantsAsTiles: this.variantsAsTilesValue,
    };
  }
}

/** Invariant 2 du socle — la seule règle qui rende l'agrégat cohérent. */
function assertVariants(snapshot: ProductSnapshot): void {
  if (snapshot.variants.length === 0) {
    throw new InvalidProductVariantsError(snapshot.id, "aucune déclinaison");
  }
  const defaults = snapshot.variants.filter((variant) => variant.isDefault).length;
  if (defaults !== 1) {
    throw new InvalidProductVariantsError(
      snapshot.id,
      `${String(defaults)} déclinaison(s) par défaut au lieu d’une`,
    );
  }
}

/**
 * Ce que {@link Product.makeVariantDefault} rend à son appelant : l'ancien
 * défaut, pour le journal, et les moitiés de fiche que la nouvelle a reçues en
 * propre — la fiche réglementaire s'écrit par ses ports, pas par `save`.
 */
export interface DefaultVariantChange {
  readonly previousDefaultId: string;
  readonly inherited: { readonly allergens: boolean; readonly nutrition: boolean };
}

/**
 * La quantité minimale **effective** d'une déclinaison : la sienne, ou celle
 * du défaut si elle le suit — et jamais aucune au poids, dont le minimum est en
 * grammes (`plan-quantite-minimale.md`, Q3). Le poids se juge sur ELLE : une
 * déclinaison passée au poids après avoir posé une grille ne la sert plus.
 */
function effectiveMinQuantities(own: VariantSnapshot, source: VariantSnapshot): MinQuantities {
  if (own.saleUnit === "weight") {
    return NO_MIN_QUANTITIES;
  }
  return own.minQuantityFollowsDefault ? source.minQuantities : own.minQuantities;
}

/** Le slug d'un produit — dérivé du nom, jamais saisi. */
function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}
