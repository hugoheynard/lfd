import {
  MAX_AUDIENCE_EVENTS_PER_BATCH,
  NO_AUDIENCE_PLACEMENT,
  NO_AUDIENCE_SOURCE,
  PRODUCT_AUDIENCE_EVENTS,
  PRODUCT_AUDIENCE_SOURCES,
  type ProductAudienceEvent,
  type ProductAudienceSource,
} from "@lfd/contracts";

import {
  AudienceBatchTooLargeError,
  AudiencePlacementMismatchError,
  AudienceSourceMismatchError,
  EmptyAudienceBatchError,
  InvalidAudiencePlacementError,
  UnknownAudienceEventError,
  UnknownAudienceSourceError,
} from "./errors/recommendation-errors.js";

/** Un geste tel que la boutique le décrit, avant validation. */
export interface RawAudienceEvent {
  readonly sku: string;
  readonly event: string;
  readonly placement?: string | undefined;
  readonly source?: string | undefined;
}

/** Une ligne de compteur à ajouter : la clé et ce qu'elle gagne. */
export interface AudienceIncrement {
  readonly sku: string;
  readonly event: ProductAudienceEvent;
  readonly placement: string;
  readonly source: ProductAudienceSource;
  readonly count: number;
}

/** Les gestes qui ne viennent pas d'une suggestion : sans emplacement. */
const DIRECT_EVENTS: ReadonlySet<ProductAudienceEvent> = new Set([
  "product_viewed",
  "added_to_cart",
]);

const PLACEMENT_PATTERN = /^[a-z0-9_]{1,32}$/;

/**
 * **Un lot de gestes observés, validé et déjà totalisé.**
 *
 * La totalisation est une règle, pas une optimisation : l'écriture se fait en
 * UN `INSERT … ON CONFLICT`, et Postgres refuse qu'une même instruction touche
 * deux fois la même ligne. Deux vues du même article dans un lot deviennent
 * donc une ligne `+2`, ici, et l'écrivain n'a pas à le savoir.
 *
 * Aucun champ ne désigne quelqu'un : il n'y en a pas à recevoir.
 */
export class AudienceEventBatch {
  private constructor(readonly increments: readonly AudienceIncrement[]) {}

  /**
   * @throws {EmptyAudienceBatchError} rien à compter.
   * @throws {AudienceBatchTooLargeError} au-delà de la borne, refusé entier.
   * @throws {UnknownAudienceEventError} un geste hors de l'énumération.
   * @throws {AudiencePlacementMismatchError} emplacement incohérent avec le geste.
   * @throws {InvalidAudiencePlacementError} emplacement mal formé.
   * @throws {UnknownAudienceSourceError} une source hors de l'énumération.
   * @throws {AudienceSourceMismatchError} source incohérente avec le geste.
   */
  static of(events: readonly RawAudienceEvent[]): AudienceEventBatch {
    if (events.length === 0) {
      throw new EmptyAudienceBatchError();
    }
    if (events.length > MAX_AUDIENCE_EVENTS_PER_BATCH) {
      throw new AudienceBatchTooLargeError(events.length, MAX_AUDIENCE_EVENTS_PER_BATCH);
    }
    const tally = new Map<string, AudienceIncrement>();
    for (const raw of events) {
      const increment = validated(raw);
      const key = `${increment.sku}\u0000${increment.event}\u0000${increment.placement}\u0000${increment.source}`;
      const previous = tally.get(key);
      tally.set(key, { ...increment, count: (previous?.count ?? 0) + 1 });
    }
    return new AudienceEventBatch([...tally.values()]);
  }

  /** Les SKU distincts du lot — ce que le catalogue doit reconnaître. */
  get skus(): readonly string[] {
    return [...new Set(this.increments.map((increment) => increment.sku))];
  }
}

function validated(raw: RawAudienceEvent): AudienceIncrement {
  const event = PRODUCT_AUDIENCE_EVENTS.find((known) => known === raw.event);
  if (event === undefined) {
    throw new UnknownAudienceEventError(raw.event);
  }
  const placement = raw.placement ?? NO_AUDIENCE_PLACEMENT;
  if (!PLACEMENT_PATTERN.test(placement)) {
    throw new InvalidAudiencePlacementError(placement);
  }
  if (DIRECT_EVENTS.has(event) !== (placement === NO_AUDIENCE_PLACEMENT)) {
    throw new AudiencePlacementMismatchError(event, placement);
  }
  return { sku: raw.sku, event, placement, source: validatedSource(event, raw.source), count: 1 };
}

/** `none` pour un geste direct, `data` ou `staff` pour une suggestion — comme le CHECK en base. */
function validatedSource(
  event: ProductAudienceEvent,
  raw: string | undefined,
): ProductAudienceSource {
  const source = PRODUCT_AUDIENCE_SOURCES.find((known) => known === (raw ?? NO_AUDIENCE_SOURCE));
  if (source === undefined) {
    throw new UnknownAudienceSourceError(raw ?? "");
  }
  if (DIRECT_EVENTS.has(event) !== (source === NO_AUDIENCE_SOURCE)) {
    throw new AudienceSourceMismatchError(event, source);
  }
  return source;
}
