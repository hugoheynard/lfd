import {
  CannotFeatureHiddenItemError,
  InvalidB2bPriceError,
  RedundantB2bPriceError,
} from "../errors/catalog-errors.js";

/**
 * **L'article du catalogue B2B** — l'agrégat, et le seul chemin d'écriture.
 *
 * Il tient ensemble deux choses de natures opposées, et c'est tout son intérêt :
 *
 * - les **faits reçus du PIM** (nom, prix canonique, famille, TVA) — subis, jamais
 *   décidés ici, remplacés au push suivant ;
 * - la **décision de la plateforme** (prix B2B, visibilité, mise en avant) — prise
 *   ici, et qui doit survivre au push.
 *
 * Les faire cohabiter dans un agrégat rend l'invariant structurel plutôt que
 * conventionnel : `refreshFromPim()` ne **peut pas** toucher à la décision, parce
 * qu'il n'écrit que les champs du premier groupe. Une ingestion en « table rase »
 * n'est plus une erreur qu'un test rattrape — elle n'est plus exprimable.
 *
 * Cycle de vie, comme partout ailleurs :
 * `repo.load(sku)` → `item.méthodeMétier()` → `repo.save(item)`.
 * Aucune écriture ne prend de primitives ; aucun `setStatus(id, valeur)`.
 */

/** Ce que le PIM envoie pour un article — les faits, sans aucune décision. */
export interface PimFacts {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly kind: string;
  readonly categoryId: string;
  readonly priceMillicents: number;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  /**
   * Le taux de TVA de CET article, résolu par le PIM. `null` = famille non
   * réglée là-bas : l'article entre au référentiel local mais n'est pas
   * vendable — cf. `CatalogReader`.
   */
  readonly vatRatePercent: number | null;
  /**
   * Les codes allergènes GS1 déclarés par le PIM. **Trois états**, tous
   * significatifs : `null` = aucune fiche réglementaire, `[]` = fiche déclarée
   * sans allergène, une liste = les codes.
   *
   * Les deux premiers ne se confondent pas : l'un est un silence, l'autre une
   * affirmation qu'un client a le droit de lire.
   */
  readonly allergens: readonly string[] | null;
  /**
   * Les **mentions d'étiquette** que le PIM a projetées pour ces codes, et
   * l'aveu que la liste peut être amputée.
   *
   * Subies comme le reste : la plateforme ne les recalcule pas, elle n'a plus le
   * référentiel réglementaire (D6). `null` suit `allergens` — et vaut aussi pour
   * un article reçu avant la v5 du fil, que seul un push complet garnira.
   *
   * `incomplete` compte autant que les libellés : un code sans obligation UE ou
   * inconnu disparaît de la projection sans bruit, et une liste vide qui se tait
   * s'affiche « sans allergène ».
   */
  readonly allergenLabels: PimAllergenLabels | null;
  readonly receivedAt: Date;
}

/** Une mention d'étiquette reçue : la catégorie INCO et son libellé français. */
export interface PimAllergenLabel {
  readonly category: string;
  readonly label: string;
}

/** Les mentions reçues pour un article, et ce qu'elles taisent. */
export interface PimAllergenLabels {
  readonly labels: readonly PimAllergenLabel[];
  readonly incomplete: boolean;
}

/** La décision de la plateforme. `null` partout = aucune décision prise. */
export interface LocalDecision {
  readonly priceMillicents: number | null;
  readonly isHidden: boolean;
  readonly isFeatured: boolean;
  readonly decidedBy: string | null;
}

/** Aucune décision : l'état d'un article que personne n'a encore touché. */
const NO_DECISION: LocalDecision = {
  priceMillicents: null,
  isHidden: false,
  isFeatured: false,
  decidedBy: null,
};

/** L'état sérialisé pour la persistance — aucun type Prisma ici. */
export interface CatalogItemState {
  readonly facts: PimFacts;
  /**
   * `null` quand plus aucune décision ne subsiste : l'adaptateur **supprime**
   * alors la ligne d'override au lieu d'en écrire une neutre. « Revenir au prix
   * du PIM » redevient ainsi l'absence de décision, pas une décision vide.
   */
  readonly decision: LocalDecision | null;
}

export class CatalogItem {
  private constructor(
    private readonly facts: PimFacts,
    private decision: LocalDecision,
  ) {}

  /**
   * **Reçoit** un article du PIM pour la première fois.
   *
   * Nomme l'intention (`receive`, pas `new`) : cet article entre au catalogue
   * parce qu'un push l'a apporté, jamais parce que quelqu'un l'a créé ici.
   */
  static receive(facts: PimFacts): CatalogItem {
    return new CatalogItem(facts, NO_DECISION);
  }

  /** Reconstitue un article persisté, décision comprise. */
  static reconstitute(state: CatalogItemState): CatalogItem {
    return new CatalogItem(state.facts, state.decision ?? NO_DECISION);
  }

  get sku(): string {
    return this.facts.sku;
  }

  /**
   * Le prix **réellement applicable** : la décision locale si elle existe, sinon
   * celui du PIM. La règle vit ici, une seule fois — la laisser fuir donnerait
   * autant de réponses qu'il y a d'écrans.
   */
  get effectivePriceMillicents(): number {
    return this.decision.priceMillicents ?? this.facts.priceMillicents;
  }

  get pimPriceMillicents(): number {
    return this.facts.priceMillicents;
  }

  /**
   * Les faits **reçus** du référentiel, en lecture.
   *
   * Exposés parce qu'un diff d'arrivée les compare un par un — et il compare
   * les CODES d'allergènes, là où la vue d'administration rend des libellés
   * déjà projetés. Deux besoins, deux formes : celle-ci est la brute, celle qui
   * se compare.
   */
  get name(): string {
    return this.facts.name;
  }

  get categoryId(): string {
    return this.facts.categoryId;
  }

  get vatRatePercent(): number | null {
    return this.facts.vatRatePercent;
  }

  get weightGrams(): number | null {
    return this.facts.weightGrams;
  }

  /** Les codes GS1 déclarés — `null` (pas de fiche) ≠ `[]` (aucun allergène). */
  get allergens(): readonly string[] | null {
    return this.facts.allergens;
  }

  /**
   * **Tous** les faits reçus, d'un bloc — et strictement eux.
   *
   * Sert à photographier le miroir au moment d'une validation. Le bloc plutôt
   * que les champs un par un, parce qu'une version doit être *complète* : un
   * getter oublié ici donnerait une archive amputée qu'aucun test ne verrait,
   * puisqu'elle serait cohérente avec elle-même.
   *
   * ⚠️ Aucune décision n'en sort, et c'est tout l'intérêt : le prix rendu est le
   * prix **reçu**, jamais l'effectif. Y glisser la décision rendrait faux dès la
   * première renégociation un objet qu'on promet immuable.
   */
  get pimFacts(): PimFacts {
    return this.facts;
  }

  get isHidden(): boolean {
    return this.decision.isHidden;
  }

  get isFeatured(): boolean {
    return this.decision.isFeatured;
  }

  /**
   * **Remplace les faits** par ceux d'un nouveau push.
   *
   * Rend un agrégat neuf portant la **même décision** : c'est ce qui garantit
   * qu'un push ne perd jamais un prix négocié. L'invariant n'est pas surveillé,
   * il est indisponible autrement.
   */
  refreshFromPim(facts: PimFacts): CatalogItem {
    return new CatalogItem(facts, this.decision);
  }

  /**
   * Pose le **prix de vente B2B**, distinct de celui du PIM.
   *
   * @throws {InvalidB2bPriceError} prix nul ou négatif.
   * @throws {RedundantB2bPriceError} prix identique à celui du PIM — le geste
   *   voulu est alors {@link alignOnPim}.
   */
  setB2bPrice(priceMillicents: number, decidedBy: string | null): void {
    if (!Number.isInteger(priceMillicents) || priceMillicents <= 0) {
      throw new InvalidB2bPriceError(priceMillicents);
    }
    if (priceMillicents === this.facts.priceMillicents) {
      throw new RedundantB2bPriceError(priceMillicents);
    }
    this.decision = { ...this.decision, priceMillicents, decidedBy };
  }

  /**
   * Retire le prix B2B : l'article **repasse au tarif du PIM**, et suivra ses
   * évolutions. C'est l'inverse de {@link setB2bPrice}, et le seul moyen de
   * revenir en arrière — d'où un nom qui dit le résultat, pas la suppression.
   */
  alignOnPim(): void {
    this.decision = { ...this.decision, priceMillicents: null };
  }

  /**
   * **Retire l'article de la vitrine B2B**, sans le retirer du PIM.
   *
   * Éteint la mise en avant au passage : les deux drapeaux ensemble diraient
   * « ne pas le montrer » et « le montrer en premier ». Corriger ici plutôt que
   * de refuser, parce que l'intention de masquer est sans ambiguïté — c'est
   * l'inverse ({@link feature} sur un masqué) qui l'est.
   */
  hide(decidedBy: string | null): void {
    this.decision = { ...this.decision, isHidden: true, isFeatured: false, decidedBy };
  }

  /** Remet l'article en vente. */
  show(decidedBy: string | null): void {
    this.decision = { ...this.decision, isHidden: false, decidedBy };
  }

  /**
   * **Met l'article en avant** dans la boutique.
   *
   * @throws {CannotFeatureHiddenItemError} l'article est masqué — sinon un
   *   commercial croirait avoir mis en vitrine un produit que personne ne voit.
   */
  feature(decidedBy: string | null): void {
    if (this.decision.isHidden) {
      throw new CannotFeatureHiddenItemError(this.facts.sku);
    }
    this.decision = { ...this.decision, isFeatured: true, decidedBy };
  }

  /** Retire la mise en avant. */
  unfeature(decidedBy: string | null): void {
    this.decision = { ...this.decision, isFeatured: false, decidedBy };
  }

  /**
   * L'état à écrire.
   *
   * `decision: null` quand plus rien n'a été décidé — l'adaptateur supprime
   * alors la ligne. Sans ça, un article ramené au prix du PIM garderait une
   * ligne de décision vide, et l'écran annoncerait une négociation qui n'existe
   * plus.
   */
  toPersistence(): CatalogItemState {
    const untouched =
      this.decision.priceMillicents === null &&
      !this.decision.isHidden &&
      !this.decision.isFeatured;
    return { facts: this.facts, decision: untouched ? null : this.decision };
  }
}
