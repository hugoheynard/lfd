import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type PromotionCatalogue,
  type PromotionCatalogueArticle,
  PromotionCatalogueReader,
} from "../../domain/ports/promotion-catalogue.reader.js";
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
import { PromotionWriteGuard } from "../commands/promotion-write-guard.js";
import { ResumePromotionHandler } from "../commands/resume-promotion.handler.js";
import { RevisePromotionHandler } from "../commands/revise-promotion.handler.js";

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
  return {
    promotions,
    catalogue,
    pose: new PosePromotionHandler(promotions, guard, new FixedIdGenerator("promo"), clock),
    revise: new RevisePromotionHandler(promotions, guard, clock),
    pause: new PausePromotionHandler(promotions, clock),
    resume: new ResumePromotionHandler(promotions, guard, clock),
    archive: new ArchivePromotionHandler(promotions, clock),
  };
}
