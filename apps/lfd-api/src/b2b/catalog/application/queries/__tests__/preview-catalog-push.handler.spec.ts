import type { CatalogSnapshot } from "@lfd/catalog-sync";

import { B2bCatalogFeedPreview } from "../../../../../pim/channels/b2b-platform/products/feed-preview.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { CatalogAdminReader } from "../../../domain/ports/catalog-admin.reader.js";
import type { CatalogConfrontation } from "../../check-catalog-parity.service.js";
import { CheckCatalogParityService } from "../../check-catalog-parity.service.js";
import type { ParityReport, ReferenceEntry } from "../../../domain/catalog-parity.js";
import { PreviewCatalogPushHandler } from "../preview-catalog-push.handler.js";

/**
 * Ce que ces cas tiennent : **l'effet sur le canal, article par article**.
 *
 * L'écran ne demande pas « que contient le catalogue » — il demande « qu'est-ce
 * que cet envoi changerait ». La réponse se dérive de l'écart, et une seule
 * erreur de dérivation la rend inutile : celle qui ferait passer une entrée pour
 * un changement. Un article absent du canal diffère forcément de lui sur le prix
 * — il n'y en a pas — donc il apparaît AUSSI dans les écarts, et l'ordre de
 * lecture décide de ce qu'on affiche.
 */

function reference(sku: string, name = `Article ${sku}`): ReferenceEntry {
  return { sku, name, priceMillicents: 250_000, vatRate: 5.5 };
}

function parity(over: Partial<ParityReport> = {}): ParityReport {
  return {
    referenceCount: 0,
    mirrorCount: 0,
    missing: [],
    stale: [],
    priceGaps: [],
    vatGaps: [],
    nameGaps: [],
    inSync: true,
    ...over,
  };
}

const EMPTY_SNAPSHOT: CatalogSnapshot = {
  version: 5,
  generatedAt: "2026-01-01T00:00:00.000Z",
  categories: [],
  products: [],
};

/**
 * Un vrai sous-type plutôt qu'un objet forcé au bon type.
 *
 * `CheckCatalogParityService` porte des champs privés, donc rien ne lui est
 * assignable structurellement : le doubler demandait un `as unknown as`, que ce
 * dépôt interdit. L'étendre coûte trois ports triviaux et rend le double
 * substituable pour de bon — si la signature de `confront()` change, le
 * compilateur le dit ici.
 */
class StubParityService extends CheckCatalogParityService {
  constructor(private readonly result: CatalogConfrontation) {
    super(new SilentPreview(), new EmptyMirror(), new FrozenClock());
  }

  override confront(): Promise<CatalogConfrontation> {
    return Promise.resolve(this.result);
  }
}

class SilentPreview extends B2bCatalogFeedPreview {
  preview(): Promise<never> {
    return Promise.reject(new Error("La confrontation est doublée : rien ne doit projeter ici."));
  }
}

class EmptyMirror extends CatalogAdminReader {
  list(): Promise<[]> {
    return Promise.resolve([]);
  }
}

class FrozenClock extends Clock {
  now(): Date {
    return new Date(EMPTY_SNAPSHOT.generatedAt);
  }
}

function service(confrontation: Partial<CatalogConfrontation>): CheckCatalogParityService {
  return new StubParityService({
    preview: {
      snapshot: EMPTY_SNAPSHOT,
      candidates: 0,
      excluded: [],
      fingerprint: "empreinte",
      ...confrontation.preview,
    },
    reference: confrontation.reference ?? [],
    parity: confrontation.parity ?? parity(),
  });
}

function handlerOn(confrontation: Partial<CatalogConfrontation>): PreviewCatalogPushHandler {
  return new PreviewCatalogPushHandler(service(confrontation));
}

describe("l'aperçu d'envoi dit l'effet sur le canal", () => {
  it("marque « entre » un article que le canal n'a pas", async () => {
    const handler = handlerOn({
      reference: [reference("CHO-001")],
      parity: parity({ missing: ["CHO-001"], inSync: false }),
    });

    const view = await handler.execute();

    expect(view.outgoing).toEqual([
      {
        sku: "CHO-001",
        name: "Article CHO-001",
        priceMillicents: 250_000,
        vatRatePercent: 5.5,
        change: "added",
      },
    ]);
  });

  /**
   * Régression : une entrée figure aussi dans les écarts de prix — le canal n'a
   * pas l'article, donc il n'en a pas le prix. Dériver les changements après les
   * entrées la ferait rétrograder en « change », et l'écran annoncerait une
   * modification là où il y a une arrivée.
   */
  it("ne rétrograde pas une entrée en changement, même si elle figure dans les écarts", async () => {
    const handler = handlerOn({
      reference: [reference("CHO-001")],
      parity: parity({
        missing: ["CHO-001"],
        priceGaps: [{ sku: "CHO-001", reference: 250_000, mirror: 0 }],
        inSync: false,
      }),
    });

    const view = await handler.execute();

    expect(view.outgoing[0]?.change).toBe("added");
  });

  it("marque « change » un écart de taux, et « inchangé » le reste", async () => {
    const handler = handlerOn({
      reference: [reference("CHO-001"), reference("CHO-002")],
      parity: parity({
        vatGaps: [{ sku: "CHO-002", reference: 5.5, mirror: 20 }],
        inSync: false,
      }),
    });

    const view = await handler.execute();

    expect(view.outgoing.map((item) => item.change)).toEqual(["unchanged", "changed"]);
  });

  /**
   * Ce qu'une simulation ne pouvait pas voir. Le pilote à blanc rendait
   * `removedSkus: []` par construction — « lui seul suppose de connaître l'état
   * de l'autre côté ». La confrontation le connaît.
   */
  it("remonte les retraits, que la simulation ne voyait jamais", async () => {
    const handler = handlerOn({
      parity: parity({ stale: ["PAI-014"], inSync: false }),
    });

    const view = await handler.execute();

    expect(view.removed).toEqual(["PAI-014"]);
  });

  /** L'empreinte est le lien entre ce qu'on regarde et ce qu'on envoie. */
  it("rend l'empreinte de la projection lue", async () => {
    const handler = handlerOn({
      preview: {
        snapshot: EMPTY_SNAPSHOT,
        candidates: 3,
        excluded: [{ sku: "CHO-009", reason: "variant_sans_prix" }],
        fingerprint: "empreinte-A",
      },
    });

    const view = await handler.execute();

    expect(view.fingerprint).toBe("empreinte-A");
    expect(view.candidates).toBe(3);
    expect(view.excluded).toEqual([{ sku: "CHO-009", reason: "variant_sans_prix" }]);
  });
});
