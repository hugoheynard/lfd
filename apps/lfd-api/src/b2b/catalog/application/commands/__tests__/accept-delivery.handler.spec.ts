import { Test } from "@nestjs/testing";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { CatalogDelivery } from "../../../domain/entities/catalog-delivery.js";
import {
  DeliveryAlreadyClosedError,
  UnknownExcludedSkuError,
} from "../../../domain/errors/catalog-errors.js";
import { CatalogDeliveryRepository } from "../../../domain/ports/catalog-delivery.repository.js";
import { CatalogItemRepository } from "../../../domain/ports/catalog-item.repository.js";
import { IngestCatalogService } from "../../ingest-catalog.service.js";
import { AcceptDeliveryCommand } from "../accept-delivery.command.js";
import { AcceptDeliveryHandler } from "../accept-delivery.handler.js";

/**
 * Ce que ces cas tiennent : **l'ordre des gestes**, et la garde qui aurait été
 * fausse si on l'avait écrite « comme on la dit ».
 */

const snapshot = (skus: readonly string[]): CatalogSnapshot => ({
  version: CATALOG_SNAPSHOT_VERSION,
  generatedAt: "2026-01-01T00:00:00.000Z",
  categories: [],
  products: skus.map((sku) => ({
    id: `p_${sku}`,
    sku,
    name: sku,
    categoryId: "c",
    kind: "daily" as const,
    variants: [
      {
        sku: `${sku}-1`,
        name: sku,
        priceMillicents: 210_000,
        weightGrams: null,
        isDefault: true,
        position: 0,
        vatRatePercent: 5.5,
        allergens: null,
        allergenLabels: null,
      },
    ],
  })),
});

interface Journal {
  readonly steps: string[];
  readonly applied: { skus: readonly string[] }[];
}

async function build(options: {
  readonly delivered?: readonly string[];
  readonly mirror?: readonly string[];
  readonly closeFails?: boolean;
  readonly missing?: boolean;
}) {
  const journal: Journal = { steps: [], applied: [] };
  const delivery = CatalogDelivery.receive({
    id: "d_1",
    revisionId: "rev_1",
    snapshot: snapshot(options.delivered ?? ["VIE-001"]),
    fingerprint: "empreinte-A",
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  const deliveries = {
    byId: () => Promise.resolve(options.missing === true ? null : delivery),
    pending: () => Promise.resolve(delivery),
    deliver: () => Promise.resolve(),
    close: () => {
      journal.steps.push("close");
      return options.closeFails === true
        ? Promise.reject(new DeliveryAlreadyClosedError("d_1", "accepted"))
        : Promise.resolve();
    },
  };
  const items = {
    loadAll: () => Promise.resolve((options.mirror ?? []).map((sku) => ({ sku }))),
  };
  const ingest = {
    apply: (_snapshot: CatalogSnapshot, excludedSkus: readonly string[] = []) => {
      journal.steps.push("apply");
      journal.applied.push({ skus: excludedSkus });
      return Promise.resolve();
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AcceptDeliveryHandler,
      { provide: CatalogDeliveryRepository, useValue: deliveries },
      { provide: CatalogItemRepository, useValue: items },
      { provide: IngestCatalogService, useValue: ingest },
      { provide: Clock, useValue: { now: () => new Date("2026-01-02T00:00:00.000Z") } },
      { provide: UnitOfWork, useValue: { run: (work: () => Promise<unknown>) => work() } },
    ],
  }).compile();

  return { handler: moduleRef.get(AcceptDeliveryHandler), journal, delivery };
}

describe("AcceptDeliveryHandler", () => {
  /**
   * 🔴 `close()` est le VERROU : il porte `status = 'pending'` dans son `where`.
   * Appliquer d'abord appliquerait deux fois avant de s'en apercevoir.
   */
  it("clôt AVANT d'appliquer", async () => {
    const { handler, journal } = await build({});

    await handler.execute(new AcceptDeliveryCommand("d_1", [], "staff_1"));

    expect(journal.steps).toEqual(["close", "apply"]);
  });

  it("n'applique RIEN si la clôture est refusée", async () => {
    const { handler, journal } = await build({ closeFails: true });

    await expect(
      handler.execute(new AcceptDeliveryCommand("d_1", [], "staff_1")),
    ).rejects.toBeInstanceOf(DeliveryAlreadyClosedError);
    expect(journal.steps).toEqual(["close"]);
  });

  it("transmet les SKU écartés à l'application, sans les réinterpréter", async () => {
    const { handler, journal } = await build({ delivered: ["VIE-001"] });

    await handler.execute(new AcceptDeliveryCommand("d_1", ["VIE-001-1"], "staff_1"));

    expect(journal.applied).toEqual([{ skus: ["VIE-001-1"] }]);
  });

  /**
   * 🔴 LE cas que la garde évidente aurait cassé. Un retrait est un SKU
   * **absent de l'arrivée** : refuser d'écarter ce qui n'y est pas rendrait
   * impossible de refuser un retrait — c'est-à-dire le geste où l'on tient le
   * plus à garder un article.
   */
  it("accepte d'écarter un SKU du miroir que l'arrivée ne porte PAS", async () => {
    const { handler, journal } = await build({ delivered: ["VIE-001"], mirror: ["PAT-002-1"] });

    await handler.execute(new AcceptDeliveryCommand("d_1", ["PAT-002-1"], "staff_1"));

    expect(journal.applied).toEqual([{ skus: ["PAT-002-1"] }]);
  });

  /** Une faute de frappe passerait sans bruit, et on croirait avoir écarté. */
  it("REFUSE un SKU que ni l'arrivée ni le miroir ne connaissent", async () => {
    const { handler, journal } = await build({ delivered: ["VIE-001"], mirror: ["PAT-002-1"] });

    await expect(
      handler.execute(new AcceptDeliveryCommand("d_1", ["INCONNU-9"], "staff_1")),
    ).rejects.toBeInstanceOf(UnknownExcludedSkuError);
    // Et rien n'a été tenté : la garde passe AVANT le verrou.
    expect(journal.steps).toEqual([]);
  });

  it("retient qui a validé, et quand", async () => {
    const { handler, delivery } = await build({});

    await handler.execute(new AcceptDeliveryCommand("d_1", [], "staff_1"));

    expect(delivery.toPersistence()).toMatchObject({
      status: "accepted",
      acceptedBy: "staff_1",
      acceptedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
  });

  it("refuse une arrivée inconnue", async () => {
    const { handler } = await build({ missing: true });

    await expect(handler.execute(new AcceptDeliveryCommand("d_9", [], null))).rejects.toThrow(
      /inconnue/i,
    );
  });
});
