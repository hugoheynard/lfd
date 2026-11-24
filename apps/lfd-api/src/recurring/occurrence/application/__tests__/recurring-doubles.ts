import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { Basket } from "../../../basket/domain/entities/basket.js";
import { BasketRepository } from "../../../basket/domain/ports/basket.repository.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import {
  BasketArticles,
  type BasketArticlesReview,
} from "../../../channels/commerce/basket-articles.js";
import {
  BasketBuyerStanding,
  type BasketCompanyMember,
} from "../../../channels/commerce/basket-buyer-standing.js";
import type { BasketFactSite } from "../../../channels/commerce/basket-facts.js";
import { BasketPickupPoints } from "../../../channels/commerce/basket-pickup-points.js";
import {
  BasketSalesTerms,
  type SalesTermsInForce,
} from "../../../channels/commerce/basket-sales-terms.js";
import {
  OccurrencePlacement,
  type OccurrencePlacementOutcome,
  type OccurrencePlacementRequest,
} from "../../../channels/commerce/occurrence-placement.js";
import {
  DUE_STATES,
  Occurrence,
  type OccurrenceSnapshot,
} from "../../domain/entities/occurrence.js";
import { BasketsBehindPlan } from "../../domain/ports/baskets-behind-plan.js";
import {
  type DueOccurrence,
  OccurrenceRepository,
} from "../../domain/ports/occurrence.repository.js";

/** Les paniers en mémoire ; `load` applique le mur et cache l'arrêt. */
export class InMemoryBaskets extends BasketRepository {
  readonly rows = new Map<string, Basket>();
  readonly saved: string[] = [];

  insert(basket: Basket): Promise<void> {
    this.rows.set(basket.id, basket);
    return Promise.resolve();
  }

  load(basketId: string, buyerUserId: string): Promise<Basket | null> {
    const basket = this.rows.get(basketId);
    const visible =
      basket !== undefined &&
      basket.buyerUserId === buyerUserId &&
      basket.lifecycle !== "cancelled";
    return Promise.resolve(visible ? basket : null);
  }

  save(basket: Basket): Promise<void> {
    this.rows.set(basket.id, basket);
    this.saved.push(basket.id);
    return Promise.resolve();
  }
}

/** Les échéances en mémoire : des états, relus en entités neuves ; `save` sous condition d'état. */
export class InMemoryOccurrences extends OccurrenceRepository {
  readonly rows = new Map<string, OccurrenceSnapshot>();
  baskets = new Map<string, Basket>();

  insertMany(occurrences: readonly Occurrence[]): Promise<void> {
    for (const occurrence of occurrences) {
      this.rows.set(occurrence.id, occurrence.snapshot);
    }
    return Promise.resolve();
  }

  serviceDaysFrom(basketId: string, from: IsoDate): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(
        this.of(basketId)
          .filter((row) => !row.serviceDay.isBefore(from))
          .map((row) => row.serviceDay.toString()),
      ),
    );
  }

  load(basketId: string, serviceDay: IsoDate): Promise<Occurrence | null> {
    const row = this.of(basketId).find((candidate) => candidate.serviceDay.equals(serviceDay));
    return Promise.resolve(row === undefined ? null : Occurrence.reconstitute(row));
  }

  openOf(basketId: string): Promise<readonly Occurrence[]> {
    return Promise.resolve(
      this.of(basketId)
        .filter((row) => ["planned", "skipped", "refused"].includes(row.state))
        .map((row) => Occurrence.reconstitute(row)),
    );
  }

  due(today: IsoDate, limit: number): Promise<readonly DueOccurrence[]> {
    const due: DueOccurrence[] = [];
    for (const row of this.rows.values()) {
      const basket = this.baskets.get(row.basketId);
      const isDue = DUE_STATES.some((state) => state === row.state);
      if (basket?.lifecycle === "active" && isDue && !row.placeOn.isAfter(today)) {
        due.push({ occurrence: Occurrence.reconstitute(row), basket });
      }
    }
    return Promise.resolve(due.slice(0, limit));
  }

  save(occurrence: Occurrence): Promise<boolean> {
    const stored = this.rows.get(occurrence.id);
    if (stored === undefined || stored.state !== occurrence.loadedState) {
      return Promise.resolve(false);
    }
    this.rows.set(occurrence.id, occurrence.snapshot);
    return Promise.resolve(true);
  }

  /** L'état d'un jour, pour les assertions. */
  stateOn(day: string): string | undefined {
    return [...this.rows.values()].find((row) => row.serviceDay.toString() === day)?.state;
  }

  /** Force l'état d'une ligne, comme un autre écrivain l'aurait fait. */
  overwrite(snapshot: OccurrenceSnapshot): void {
    this.rows.set(snapshot.id, snapshot);
  }

  private of(basketId: string): OccurrenceSnapshot[] {
    return [...this.rows.values()].filter((row) => row.basketId === basketId);
  }
}

/** Les paniers en retard de planification : ceux qu'on lui donne. */
export class FixedBehind extends BasketsBehindPlan {
  constructor(readonly baskets: readonly Basket[] = []) {
    super();
  }

  behind(): Promise<readonly Basket[]> {
    return Promise.resolve(this.baskets);
  }
}

/** Le commerce qui passe : l'issue scriptée, la demande gardée. */
export class ScriptedPlacement extends OccurrencePlacement {
  readonly requests: OccurrencePlacementRequest[] = [];

  constructor(
    private readonly outcome: (request: OccurrencePlacementRequest) => OccurrencePlacementOutcome,
  ) {
    super();
  }

  place(request: OccurrencePlacementRequest): Promise<OccurrencePlacementOutcome> {
    this.requests.push(request);
    return Promise.resolve(this.outcome(request));
  }
}

/**
 * Les comptes : `members` est la liste des « personne/société » actuels,
 * `publicPayers` les sociétés qui règlent sur engagement budgétaire. Le
 * principal de `chalet` est `maison`.
 */
export class FixedStanding extends BasketBuyerStanding {
  constructor(
    private readonly members: ReadonlySet<string> = new Set(["user_1/chalet"]),
    private readonly listed: readonly BasketCompanyMember[] = [],
    private readonly publicPayers: ReadonlySet<string> = new Set(),
  ) {
    super();
  }

  isMember(userId: string, companyId: string): Promise<boolean> {
    return Promise.resolve(this.members.has(`${userId}/${companyId}`));
  }

  companyName(companyId: string): Promise<string | null> {
    return Promise.resolve(companyId === "chalet" ? "Chalet Gentiane" : null);
  }

  membersOf(): Promise<readonly BasketCompanyMember[]> {
    return Promise.resolve(this.listed);
  }

  isPublicPayer(companyId: string): Promise<boolean> {
    return Promise.resolve(this.publicPayers.has(companyId));
  }

  async siteOf(companyId: string): Promise<BasketFactSite> {
    const name = (await this.companyName(companyId)) ?? companyId;
    return { companyId, name, principalCompanyId: companyId === "chalet" ? "maison" : null };
  }
}

/** La boîte d'envoi : les faits écrits, dans l'ordre. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }

  /** Les types écrits, pour les assertions. */
  get types(): readonly string[] {
    return this.facts.map((fact) => fact.type);
  }
}

/** Le catalogue : ce qu'on lui dit, et les SKU réservés ailleurs. */
export class FixedArticles extends BasketArticles {
  readonly opened: (readonly string[])[] = [];

  constructor(
    private readonly answer: BasketArticlesReview = { weightSold: new Set(), operationOnly: [] },
    private readonly refusal: Error | null = null,
  ) {
    super();
  }

  review(): Promise<BasketArticlesReview> {
    return Promise.resolve(this.answer);
  }

  ensureOpenTo(_companyId: string | null, skus: readonly string[]): Promise<void> {
    this.opened.push(skus);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

/** Les CGV en vigueur : une réponse fixe. */
export class FixedSalesTerms extends BasketSalesTerms {
  constructor(
    private readonly answer: SalesTermsInForce = {
      key: "salesTermsPro",
      revision: 3,
      fileId: "file_cgv_3",
    },
  ) {
    super();
  }

  inForceFor(): Promise<SalesTermsInForce> {
    return Promise.resolve(this.answer);
  }
}

/** Les points de retrait : `point_1` s'appelle « Atelier ». */
export class FixedPickupPoints extends BasketPickupPoints {
  nameOf(pickupAddressId: string): Promise<string | null> {
    return Promise.resolve(pickupAddressId === "point_1" ? "Atelier" : null);
  }
}
