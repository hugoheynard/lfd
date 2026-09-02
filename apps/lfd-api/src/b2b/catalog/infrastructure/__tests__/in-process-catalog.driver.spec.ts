import { Test } from "@nestjs/testing";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { IngestCatalogService } from "../../application/ingest-catalog.service.js";
import type { CatalogDelivery } from "../../domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../../domain/ports/catalog-delivery.repository.js";
import { InProcessB2bCatalogDriver } from "../in-process-catalog.driver.js";

/**
 * **L'aiguillage**, et rien d'autre.
 *
 * C'est le seul endroit du dépôt où « livrer » cesse d'être « mettre en vente »,
 * et le seul geste de tout ce chantier qui change un comportement en production.
 * Ce que ces cas tiennent : un chemin actif à la fois, et le rapport qui dit
 * lequel.
 */

const snapshot: CatalogSnapshot = {
  version: CATALOG_SNAPSHOT_VERSION,
  generatedAt: "2026-01-01T00:00:00.000Z",
  categories: [],
  products: [
    {
      id: "p_1",
      sku: "VIE-001",
      name: "Croissant",
      categoryId: "c_vie",
      kind: "daily",
      variants: [
        {
          sku: "VIE-001-1",
          name: "Croissant",
          priceMillicents: 210_000,
          weightGrams: null,
          isDefault: true,
          position: 0,
          vatRatePercent: 5.5,
          allergens: null,
          allergenLabels: null,
        },
      ],
    },
  ],
};

const ORIGIN = { revisionId: "rev_7", fingerprint: "empreinte-A" };

async function build(inboxOpen: boolean) {
  const applied: CatalogSnapshot[] = [];
  const deposited: CatalogDelivery[] = [];

  const moduleRef = await Test.createTestingModule({
    providers: [
      InProcessB2bCatalogDriver,
      {
        provide: IngestCatalogService,
        useValue: {
          apply: (received: CatalogSnapshot) => {
            applied.push(received);
            return Promise.resolve({
              acceptedProducts: 1,
              acceptedVariants: 1,
              acceptedCategories: 0,
              removedSkus: ["PAT-002-1"],
            });
          },
        },
      },
      {
        provide: CatalogDeliveryRepository,
        useValue: {
          deliver: (delivery: CatalogDelivery) => {
            deposited.push(delivery);
            return Promise.resolve();
          },
        },
      },
      { provide: AppConfig, useValue: { deliveryInboxEnabled: () => inboxOpen } },
      { provide: IdGenerator, useValue: { next: () => "d_1" } },
      { provide: Clock, useValue: { now: () => new Date("2026-01-02T09:00:00.000Z") } },
    ],
  }).compile();

  return { driver: moduleRef.get(InProcessB2bCatalogDriver), applied, deposited };
}

describe("le canal B2B en processus", () => {
  describe("réception FERMÉE — le chemin historique", () => {
    it("écrit les faits de vente, tout de suite", async () => {
      const { driver, applied, deposited } = await build(false);

      const report = await driver.send(snapshot, ORIGIN);

      expect(applied).toHaveLength(1);
      expect(deposited).toEqual([]);
      expect(report.status).toBe("applied");
      expect(report.removedSkus).toEqual(["PAT-002-1"]);
    });
  });

  describe("réception OUVERTE — on dépose, on ne vend pas", () => {
    /** 🔴 Le cœur : rien n'atteint les faits de vente. */
    it("dépose une arrivée et n’applique RIEN", async () => {
      const { driver, applied, deposited } = await build(true);

      await driver.send(snapshot, ORIGIN);

      expect(applied).toEqual([]);
      expect(deposited).toHaveLength(1);
      expect(deposited[0]?.currentStatus).toBe("pending");
    });

    /**
     * L'ancre et l'empreinte VOYAGENT : la plateforme ne peut pas aller les lire
     * chez le référentiel, et une empreinte recalculée dirait ce que le catalogue
     * est devenu — pas ce qui a été relu.
     */
    it("garde l’ancre et l’empreinte que le référentiel a livrées", async () => {
      const { driver, deposited } = await build(true);

      await driver.send(snapshot, ORIGIN);

      expect(deposited[0]?.revisionId).toBe("rev_7");
      expect(deposited[0]?.fingerprint).toBe("empreinte-A");
    });

    it("porte le snapshot ENTIER — sans lui, « ce qui sort » ne se valide pas", async () => {
      const { driver, deposited } = await build(true);

      await driver.send(snapshot, ORIGIN);

      expect(deposited[0]?.snapshot).toBe(snapshot);
    });

    /**
     * 🔴 Le champ qui empêche un contresens. Les compteurs valent la même chose
     * des deux côtés — ce qui est ARRIVÉ — et sans `status`, l'émetteur lirait
     * « 1 accepté, aucun retrait » puis conclurait que le catalogue est en
     * ligne, alors que des retraits attendent précisément d'être relus.
     */
    it("dit « queued », et laisse les retraits VIDES", async () => {
      const { driver } = await build(true);

      const report = await driver.send(snapshot, ORIGIN);

      expect(report.status).toBe("queued");
      expect(report.acceptedProducts).toBe(1);
      expect(report.acceptedVariants).toBe(1);
      // Exact plutôt que prudent : rien n'a été retiré de la vente. Ce que
      // l'arrivée porte comme retraits se lit dans son diff, à la validation.
      expect(report.removedSkus).toEqual([]);
    });

    it("date la réception sur l’horloge, jamais sur le snapshot reçu", async () => {
      const { driver } = await build(true);

      const report = await driver.send(snapshot, ORIGIN);

      expect(report.appliedAt).toBe("2026-01-02T09:00:00.000Z");
    });
  });
});
