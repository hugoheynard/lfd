import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingPublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/__tests__/recording-public-settings-edge-cache.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type PromotionCatalogue,
  type PromotionCatalogueArticle,
  PromotionCatalogueReader,
} from "../../domain/ports/promotion-catalogue.reader.js";
import { DeliveryZoneDirectory } from "../../domain/ports/delivery-zone.directory.js";
import { PickupPointDirectory } from "../../domain/ports/pickup-point.directory.js";
import { PromotionRivalsReader } from "../../domain/ports/promotion-rivals.reader.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import type { PromotionAct } from "../../domain/promotion-act.js";
import {
  applicationPointOf,
  type PromotionApplicationPoint,
} from "../../domain/promotion-fulfillment.js";
import type { Promotion } from "../../domain/promotion.js";
import { ArchivePromotionHandler } from "../commands/archive-promotion.handler.js";
import { PausePromotionHandler } from "../commands/pause-promotion.handler.js";
import { PosePromotionHandler } from "../commands/pose-promotion.handler.js";
import { PromotionFulfillmentNames } from "../commands/promotion-fulfillment-names.js";
import { PromotionWriteGuard } from "../commands/promotion-write-guard.js";
import { ResumePromotionHandler } from "../commands/resume-promotion.handler.js";
import { RevisePromotionHandler } from "../commands/revise-promotion.handler.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";

/**
 * **Les doublés des gestes d'écriture** (plan des promotions, L3 et L7) —
 * chacun hérite du port qu'il joue, aucun `jest.fn()`.
 */

/** Le dépôt en mémoire : l'état et ses actes, écrits ensemble comme en base. */
export class InMemoryPromotions extends PromotionRepository {
  readonly stored = new Map<string, Promotion>();
  readonly acts: PromotionAct[] = [];

  load(id: string): Promise<Promotion | null> {
    return Promise.resolve(this.stored.get(id) ?? null);
  }

  /** Le verrou n'a pas de sens en mémoire : les tests d'application sont séquentiels. */
  loadLocked(id: string): Promise<Promotion | null> {
    return this.load(id);
  }

  save(promotion: Promotion, act: PromotionAct): Promise<void> {
    this.stored.set(promotion.id, promotion);
    this.acts.push(act);
    return Promise.resolve();
  }
}

/** Les rivales, lues dans le même dépôt en mémoire — l'état commis. */
export class InMemoryPromotionRivals extends PromotionRivalsReader {
  constructor(private readonly stored: ReadonlyMap<string, Promotion>) {
    super();
  }

  unarchived(point: PromotionApplicationPoint): Promise<readonly Promotion[]> {
    return Promise.resolve(
      [...this.stored.values()].filter(
        (promotion) =>
          promotion.status !== "archived" &&
          applicationPointOf(promotion.terms.fulfillment) === point,
      ),
    );
  }
}

/** Ce que connaissent les annuaires doublés : deux points, deux zones (`promotions.md`, § 2.14). */
export const KNOWN_POINTS: ReadonlyMap<string, string> = new Map([
  ["pk_coeur", "Cœur de station"],
  ["pk_gare", "La gare"],
]);
export const KNOWN_ZONES: ReadonlyMap<string, string> = new Map([
  ["zone_vallee", "La vallée"],
  ["zone_sommet", "Le sommet"],
]);

function labelsIn(
  known: ReadonlyMap<string, string>,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  return Promise.resolve(
    new Map(ids.flatMap((id) => (known.has(id) ? [[id, known.get(id) ?? id] as const] : []))),
  );
}

/** Les sites connus, en mémoire. */
export class FixedPickupPointDirectory extends PickupPointDirectory {
  constructor(private readonly known: ReadonlyMap<string, string> = KNOWN_POINTS) {
    super();
  }

  labelsOf(pickupIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return labelsIn(this.known, pickupIds);
  }
}

/** Les zones connues, en mémoire. */
export class FixedDeliveryZoneDirectory extends DeliveryZoneDirectory {
  constructor(private readonly known: ReadonlyMap<string, string> = KNOWN_ZONES) {
    super();
  }

  labelsOf(zoneIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return labelsIn(this.known, zoneIds);
  }
}

/** Les noms, sur les deux annuaires doublés. */
export function fulfillmentNames(): PromotionFulfillmentNames {
  return new PromotionFulfillmentNames(
    new FixedDeliveryZoneDirectory(),
    new FixedPickupPointDirectory(),
  );
}

/** Un pain à la pièce, une viennoiserie, et un article au poids. */
export const CATALOGUE_ARTICLES: readonly PromotionCatalogueArticle[] = [
  {
    sku: "VIE-001-1",
    name: "Croissant",
    productId: "p_croissant",
    categoryPath: ["c_viennoiserie"],
    saleUnit: "piece",
  },
  {
    sku: "PAI-001-1",
    name: "Pain de campagne",
    productId: "p_campagne",
    categoryPath: ["c_pains"],
    saleUnit: "piece",
  },
  {
    sku: "PAI-002-1",
    name: "Pain de seigle au poids",
    productId: "p_seigle",
    categoryPath: ["c_pains"],
    saleUnit: "weight",
  },
];

export class FixedPromotionCatalogue extends PromotionCatalogueReader {
  /** Combien de fois le catalogue a été lu — il ne l'est que s'il existe une rivale. */
  reads = 0;

  constructor(
    private readonly articles: readonly PromotionCatalogueArticle[] = CATALOGUE_ARTICLES,
  ) {
    super();
  }

  snapshot(): Promise<PromotionCatalogue> {
    this.reads += 1;
    return Promise.resolve({
      articles: [...this.articles].sort((left, right) => left.name.localeCompare(right.name, "fr")),
      categoryNames: new Map([
        ["c_viennoiserie", "Viennoiserie"],
        ["c_pains", "Pains"],
      ]),
      productNames: new Map([["p_croissant", "Croissant"]]),
    });
  }
}

/** Les cinq gestes, branchés sur le dépôt en mémoire. */
export function writeScene(at: Date) {
  const promotions = new InMemoryPromotions();
  const catalogue = new FixedPromotionCatalogue();
  const clock = new FixedClock(at);
  const guard = new PromotionWriteGuard(new InMemoryPromotionRivals(promotions.stored), catalogue);
  const names = fulfillmentNames();
  const afterCommit = new HeldAfterCommit();
  const edge = new RecordingPublicSettingsEdgeCache();
  const purge = [afterCommit, edge] as const;
  const uow = new DirectUnitOfWork();
  return {
    promotions,
    catalogue,
    afterCommit,
    edge,
    pose: new PosePromotionHandler(
      promotions,
      guard,
      names,
      new FixedIdGenerator("promo"),
      clock,
      ...purge,
      uow,
      inMemoryIntents(),
    ),
    revise: new RevisePromotionHandler(promotions, guard, names, clock, ...purge, uow),
    pause: new PausePromotionHandler(promotions, names, clock, ...purge, uow),
    resume: new ResumePromotionHandler(promotions, guard, names, clock, ...purge, uow),
    archive: new ArchivePromotionHandler(promotions, names, clock, ...purge, uow),
  };
}
