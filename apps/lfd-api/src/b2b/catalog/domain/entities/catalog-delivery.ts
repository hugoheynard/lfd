import type { CatalogSnapshot } from "@lfd/catalog-sync";

import { DeliveryAlreadyClosedError } from "../errors/catalog-errors.js";

/**
 * L'état d'une arrivée. **Trois**, pas deux — et le troisième n'est pas du
 * confort : une arrivée remplacée sans avoir été lue n'a pas été acceptée. Les
 * confondre effacerait le seul fait qui compte alors, à savoir que quelqu'un
 * s'apprêtait à relire quelque chose qui a disparu sous ses yeux.
 */
export type DeliveryStatus = "pending" | "accepted" | "superseded";

/** Ce que la persistance rend, et ce qu'elle reprend — aucun type Prisma ici. */
export interface CatalogDeliveryState {
  readonly id: string;
  readonly revisionId: string;
  readonly snapshot: CatalogSnapshot;
  readonly fingerprint: string;
  readonly status: DeliveryStatus;
  readonly excludedSkus: readonly string[] | null;
  readonly receivedAt: Date;
  readonly acceptedAt: Date | null;
  readonly acceptedBy: string | null;
}

/**
 * **Ce que le référentiel a livré, et que personne n'a encore accepté.**
 *
 * L'agrégat qui sépare *livrer* de *mettre en vente* — deux gestes qui n'en
 * faisaient qu'un, et qui appartenaient tous deux au PIM. Un article reçu était
 * achetable dans la même requête, sans qu'aucun humain de la plateforme ne l'ait
 * relu.
 *
 * ## Pourquoi une arrivée, et pas un état sur l'article
 *
 * Un `pending` posé sur `CatalogItem` ne gate que les **arrivées**. Un article
 * déjà en vente dont le PIM change le prix serait rafraîchi sur place, et le
 * nouveau prix partirait au client sans relecture : le cas le plus sensible
 * passerait, en croyant tout retenir.
 *
 * ## Pourquoi le snapshot entier
 *
 * Un retrait est l'**absence** d'un SKU. Il ne s'exprime pas dans une table de
 * lignes entrantes — sans le snapshot complet, « ce qui sort » ne serait pas
 * validable, et c'est justement ce qu'un relecteur doit voir.
 *
 * ## Les transitions, et ce qu'elles refusent
 *
 * `pending` est le seul état ouvert. De là on **accepte** (la validation pose
 * une version) ou on est **remplacé** (une nouvelle livraison arrive). Une
 * arrivée close ne se rouvre jamais : une version est immuable, et rejouer une
 * acceptation en poserait une seconde.
 *
 * ⚠️ L'unicité de l'arrivée en attente n'est **pas** tenue ici : elle l'est par
 * un index partiel de Postgres (`catalog_delivery_une_seule_en_attente`). Deux
 * livraisons simultanées contourneraient n'importe quelle garde applicative, et
 * le relecteur validerait alors une arrivée que le PIM a déjà remplacée.
 */
export class CatalogDelivery {
  private constructor(
    private readonly state: CatalogDeliveryState,
    private status: DeliveryStatus,
    private excluded: readonly string[] | null,
    private acceptedAt: Date | null,
    private acceptedBy: string | null,
  ) {}

  /** Le référentiel vient de livrer. L'arrivée naît **en attente**, jamais autrement. */
  static receive(input: {
    readonly id: string;
    readonly revisionId: string;
    readonly snapshot: CatalogSnapshot;
    readonly fingerprint: string;
    readonly receivedAt: Date;
  }): CatalogDelivery {
    return new CatalogDelivery(
      { ...input, status: "pending", excludedSkus: null, acceptedAt: null, acceptedBy: null },
      "pending",
      null,
      null,
      null,
    );
  }

  /** Rehydrate depuis la persistance — les invariants ne sont pas rejoués. */
  static from(state: CatalogDeliveryState): CatalogDelivery {
    return new CatalogDelivery(
      state,
      state.status,
      state.excludedSkus,
      state.acceptedAt,
      state.acceptedBy,
    );
  }

  /**
   * La plateforme accepte cette arrivée. Les SKU **écartés** gardent leurs faits
   * courants — ils n'ont simplement pas changé.
   *
   * @throws {DeliveryAlreadyClosedError} l'arrivée est déjà close.
   */
  accept(excludedSkus: readonly string[], at: Date, by: string | null): void {
    this.refuseIfClosed();
    this.status = "accepted";
    // `[...]` plutôt que la référence : un agrégat ne partage pas son état avec
    // l'appelant, sinon celui-ci peut le muter après coup, hors de toute règle.
    this.excluded = [...excludedSkus];
    this.acceptedAt = at;
    this.acceptedBy = by;
  }

  /**
   * Une nouvelle livraison prend la place de celle-ci.
   *
   * Le prix est assumé et l'écran doit le dire : une relecture en cours est
   * effacée. C'est ce qui fait que l'ordre cesse d'être une question — on ne
   * peut pas valider une arrivée périmée, elle n'existe plus.
   *
   * @throws {DeliveryAlreadyClosedError} l'arrivée est déjà close.
   */
  supersede(): void {
    this.refuseIfClosed();
    this.status = "superseded";
  }

  private refuseIfClosed(): void {
    if (this.status !== "pending") {
      throw new DeliveryAlreadyClosedError(this.state.id, this.status);
    }
  }

  get id(): string {
    return this.state.id;
  }

  get revisionId(): string {
    return this.state.revisionId;
  }

  get snapshot(): CatalogSnapshot {
    return this.state.snapshot;
  }

  get fingerprint(): string {
    return this.state.fingerprint;
  }

  get currentStatus(): DeliveryStatus {
    return this.status;
  }

  get receivedAt(): Date {
    return this.state.receivedAt;
  }

  get excludedSkus(): readonly string[] | null {
    return this.excluded;
  }

  /** L'état à persister — l'adaptateur lit ceci, jamais les champs un par un. */
  toPersistence(): CatalogDeliveryState {
    return {
      ...this.state,
      status: this.status,
      excludedSkus: this.excluded,
      acceptedAt: this.acceptedAt,
      acceptedBy: this.acceptedBy,
    };
  }
}
