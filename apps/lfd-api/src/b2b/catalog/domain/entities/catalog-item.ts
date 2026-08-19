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
  readonly priceCents: number;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  readonly receivedAt: Date;
}

/** La décision de la plateforme. `null` partout = aucune décision prise. */
export interface LocalDecision {
  readonly priceCents: number | null;
  readonly isHidden: boolean;
  readonly isFeatured: boolean;
  readonly decidedBy: string | null;
}

/** Aucune décision : l'état d'un article que personne n'a encore touché. */
const NO_DECISION: LocalDecision = {
  priceCents: null,
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
  get effectivePriceCents(): number {
    return this.decision.priceCents ?? this.facts.priceCents;
  }

  get pimPriceCents(): number {
    return this.facts.priceCents;
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
  setB2bPrice(priceCents: number, decidedBy: string | null): void {
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      throw new InvalidB2bPriceError(priceCents);
    }
    if (priceCents === this.facts.priceCents) {
      throw new RedundantB2bPriceError(priceCents);
    }
    this.decision = { ...this.decision, priceCents, decidedBy };
  }

  /**
   * Retire le prix B2B : l'article **repasse au tarif du PIM**, et suivra ses
   * évolutions. C'est l'inverse de {@link setB2bPrice}, et le seul moyen de
   * revenir en arrière — d'où un nom qui dit le résultat, pas la suppression.
   */
  alignOnPim(): void {
    this.decision = { ...this.decision, priceCents: null };
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
      this.decision.priceCents === null && !this.decision.isHidden && !this.decision.isFeatured;
    return { facts: this.facts, decision: untouched ? null : this.decision };
  }
}
