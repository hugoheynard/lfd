import { Test } from "@nestjs/testing";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { CatalogDelivery } from "../../../domain/entities/catalog-delivery.js";
import { CatalogItem, type PimFacts } from "../../../domain/entities/catalog-item.js";
import type { CatalogVersion } from "../../../domain/entities/catalog-version.js";
import { CatalogVersionRepository } from "../../../domain/ports/catalog-version.repository.js";
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
  readonly archived: CatalogVersion[];
}

/**
 * Le miroir est peuplé de **vrais agrégats**, pas d'objets `{ sku }`.
 *
 * C'est ce qui fait que ces cas prouvent quelque chose sur la photographie : un
 * double plat rendrait des faits `undefined` que la version archiverait sans
 * broncher, et la suite resterait verte sur une archive vide.
 */
function mirrorItem(sku: string, priceMillicents = 210_000): CatalogItem {
  const facts: PimFacts = {
    sku,
    productId: `p_${sku}`,
    productSku: sku.replace(/-\d+$/, ""),
    name: sku,
    kind: "daily",
    categoryId: "c",
    priceMillicents,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    allergens: null,
    allergenLabels: null,
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  return CatalogItem.receive(facts);
}

async function build(options: {
  readonly delivered?: readonly string[];
  readonly mirror?: readonly string[];
  readonly closeFails?: boolean;
  readonly applyFails?: boolean;
  readonly missing?: boolean;
}) {
  const journal: Journal = { steps: [], applied: [], archived: [] };
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
    loadAll: () => Promise.resolve((options.mirror ?? []).map((sku) => mirrorItem(sku))),
  };
  const ingest = {
    apply: (_snapshot: CatalogSnapshot, excludedSkus: readonly string[] = []) => {
      journal.steps.push("apply");
      journal.applied.push({ skus: excludedSkus });
      return options.applyFails === true
        ? Promise.reject(new Error("l'application a échoué"))
        : Promise.resolve();
    },
  };
  const versions = {
    append: (version: CatalogVersion) => {
      journal.steps.push("version");
      journal.archived.push(version);
      return Promise.resolve();
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AcceptDeliveryHandler,
      { provide: CatalogDeliveryRepository, useValue: deliveries },
      { provide: CatalogItemRepository, useValue: items },
      { provide: CatalogVersionRepository, useValue: versions },
      { provide: IngestCatalogService, useValue: ingest },
      { provide: Clock, useValue: { now: () => new Date("2026-01-02T00:00:00.000Z") } },
      { provide: IdGenerator, useValue: { next: () => "cver_1" } },
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
  it("clôt, PUIS applique, PUIS archive", async () => {
    const { handler, journal } = await build({});

    await handler.execute(new AcceptDeliveryCommand("d_1", [], "staff_1"));

    expect(journal.steps).toEqual(["close", "apply", "version"]);
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

  /**
   * 🔴 La photographie est prise sur le MIROIR relu, pas sur le snapshot reçu.
   *
   * Le cas est construit pour que les deux divergent : `PAT-002-1` est au
   * catalogue et l'arrivée ne le porte pas. Une version déduite du snapshot
   * l'oublierait — et l'archive dirait qu'un article en vente n'existait pas.
   */
  it("photographie le miroir, pas ce que l’arrivée portait", async () => {
    const { handler, journal } = await build({
      delivered: ["VIE-001"],
      mirror: ["PAT-002-1", "VIE-001-1"],
    });

    await handler.execute(new AcceptDeliveryCommand("d_1", ["PAT-002-1"], "staff_1"));

    const [version] = journal.archived;
    expect(version?.lines.map((line) => line.sku)).toEqual(["PAT-002-1", "VIE-001-1"]);
  });

  /**
   * L'archive doit se rattacher à ce qui a été relu : sans l'ancre ni
   * l'empreinte, « quelle livraison a produit cette version » n'a plus de
   * réponse, et les SKU écartés sont la moitié du geste qu'on archive.
   */
  it("rattache la version à l’arrivée : ancre, empreinte, écartés", async () => {
    const { handler, journal } = await build({ delivered: ["VIE-001"], mirror: ["VIE-001-1"] });

    await handler.execute(new AcceptDeliveryCommand("d_1", ["VIE-001-1"], "staff_1"));

    expect(journal.archived[0]?.toPersistence()).toMatchObject({
      id: "cver_1",
      deliveryId: "d_1",
      revisionId: "rev_1",
      fingerprint: "empreinte-A",
      excludedSkus: ["VIE-001-1"],
      createdBy: "staff_1",
    });
  });

  /**
   * Le même instant sur les deux, et pas deux lectures d'horloge : « la version
   * posée par cette validation » deviendrait sinon une question de tri, sur des
   * millisecondes que personne ne pourrait départager après coup.
   */
  it("date l’arrivée et sa version du MÊME instant", async () => {
    const { handler, journal, delivery } = await build({ mirror: ["VIE-001-1"] });

    await handler.execute(new AcceptDeliveryCommand("d_1", [], "staff_1"));

    expect(journal.archived[0]?.createdAt).toEqual(delivery.toPersistence().acceptedAt);
  });

  /**
   * Régression par anticipation : archiver avant d'appliquer donnerait une
   * version que le catalogue ne porte pas, et qui survivrait à l'échec puisque
   * rien après elle ne serait tenté.
   */
  it("n’archive RIEN quand l’application échoue", async () => {
    const { handler, journal } = await build({ applyFails: true });

    await expect(handler.execute(new AcceptDeliveryCommand("d_1", [], "staff_1"))).rejects.toThrow(
      /échoué/,
    );
    expect(journal.archived).toEqual([]);
  });
});
