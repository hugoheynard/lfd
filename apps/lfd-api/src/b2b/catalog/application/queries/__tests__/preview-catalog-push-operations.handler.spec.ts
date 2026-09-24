import { CATALOG_SNAPSHOT_VERSION } from "@lfd/catalog-sync";
import type { SyncOperation } from "@lfd/catalog-sync";

import {
  B2bCatalogFeedPreview,
  type FeedPreview,
} from "../../../../../pim/channels/b2b-platform/products/feed-preview.js";
import { Clock } from "../../../../../platform/time/clock.js";
import type { CatalogOperationFacts } from "../../../domain/entities/catalog-operation.js";
import { CatalogAdminReader } from "../../../domain/ports/catalog-admin.reader.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../../../domain/ports/received-operations.reader.js";
import { receivedNoel } from "../../commands/__tests__/operation-doubles.js";
import { CheckCatalogParityService } from "../../check-catalog-parity.service.js";
import { PreviewCatalogPushHandler } from "../preview-catalog-push.handler.js";

/**
 * Régression (2026-09-24) : l'aperçu ne connaissait pas les opérations. Une
 * opération préparée au PIM ne changeait aucun article, l'écran disait « la
 * boutique est à jour » et grisait l'envoi — elle ne pouvait jamais partir.
 *
 * Ces cas traversent la VRAIE confrontation, ports doublés : c'est elle qui
 * rapproche la projection du miroir, et la doubler ne prouverait rien.
 */

/** Noël tel que le fil v11 le porterait. Dates comparées entre elles seulement. */
function sentNoel(over: Partial<SyncOperation> = {}): SyncOperation {
  const facts = receivedNoel();
  return {
    key: facts.key,
    name: { fr: "Noël", en: "Christmas" },
    lede: null,
    image: null,
    announceFrom: facts.announceFrom.toISOString(),
    orderFrom: null,
    orderUntil: facts.orderUntil.toISOString(),
    pickupFrom: facts.pickupFrom,
    pickupUntil: facts.pickupUntil,
    audience: "both",
    skus: [...facts.skus],
    ...over,
  };
}

class ProjectedOperations extends B2bCatalogFeedPreview {
  constructor(private readonly operations: readonly SyncOperation[]) {
    super();
  }

  preview(generatedAt: string): Promise<FeedPreview> {
    return Promise.resolve({
      snapshot: {
        version: CATALOG_SNAPSHOT_VERSION,
        generatedAt,
        categories: [],
        products: [],
        orderTimeLimits: [],
        operations: [...this.operations],
      },
      candidates: 0,
      excluded: [],
      fingerprint: "empreinte",
    });
  }
}

class EmptyMirror extends CatalogAdminReader {
  list(): Promise<[]> {
    return Promise.resolve([]);
  }
}

class HeldOperations extends ReceivedOperationsReader {
  constructor(private readonly operations: readonly ReceivedOperation[]) {
    super();
  }

  list(): Promise<readonly ReceivedOperation[]> {
    return Promise.resolve(this.operations);
  }
}

class FrozenClock extends Clock {
  now(): Date {
    return receivedNoel().receivedAt;
  }
}

function held(facts: CatalogOperationFacts, withdrawnAt: Date | null = null): ReceivedOperation {
  return { received: facts, withdrawnAt, override: null };
}

async function operationsOf(
  projected: readonly SyncOperation[],
  mirror: readonly ReceivedOperation[],
) {
  const service = new CheckCatalogParityService(
    new ProjectedOperations(projected),
    new EmptyMirror(),
    new FrozenClock(),
    new HeldOperations(mirror),
  );
  return (await new PreviewCatalogPushHandler(service).execute()).operations;
}

describe("l'aperçu d'envoi dit l'effet sur les opérations du canal", () => {
  /** Régression (2026-09-24) : une opération préparée au PIM n'apparaissait nulle part. */
  it("marque « entre » une opération préparée que le canal ne tient pas", async () => {
    expect(await operationsOf([sentNoel()], [])).toEqual([
      { key: "noel-2026", name: "Noël", change: "added" },
    ]);
  });

  it("marque « inchangée » une opération que le canal tient à l'identique", async () => {
    const [noel] = await operationsOf([sentNoel()], [held(receivedNoel())]);

    expect(noel?.change).toBe("unchanged");
  });

  it("marque « change » une opération dont la sélection a été réordonnée", async () => {
    const [noel] = await operationsOf(
      [sentNoel({ skus: ["VIE-001-1", "PAT-9-1"] })],
      [held(receivedNoel())],
    );

    expect(noel?.change).toBe("changed");
  });

  it("marque « change » une opération dont la fin de commande a bougé", async () => {
    const [noel] = await operationsOf(
      [sentNoel({ orderUntil: receivedNoel().pickupFrom + "T09:00:00.000Z" })],
      [held(receivedNoel())],
    );

    expect(noel?.change).toBe("changed");
  });

  /**
   * Régression (2026-09-24) : une opération archivée au PIM ne part plus
   * (`projectOperations` l'écarte), et l'envoi la retirerait du canal — sans
   * que l'aperçu le dise.
   */
  it("marque « retirée » une opération que le canal tient et que l'envoi ne porte plus", async () => {
    expect(await operationsOf([], [held(receivedNoel())])).toEqual([
      { key: "noel-2026", name: "Noël", change: "withdrawn" },
    ]);
  });

  it("ignore une opération déjà retirée du canal et que l'envoi ne porte pas", async () => {
    const withdrawn = held(receivedNoel(), receivedNoel().receivedAt);

    expect(await operationsOf([], [withdrawn])).toEqual([]);
  });

  it("fait entrer de nouveau une opération retirée que l'envoi reporte", async () => {
    const withdrawn = held(receivedNoel(), receivedNoel().receivedAt);

    const [noel] = await operationsOf([sentNoel()], [withdrawn]);

    expect(noel?.change).toBe("added");
  });
});
