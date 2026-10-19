import type { CatalogPricing } from "@lfd/contracts";

import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import type { CompanyMercuriale } from "../../../../pricing/domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../../../pricing/domain/ports/company-mercuriale.reader.js";
import type { CustomerVolumeReader } from "../../../../pricing/domain/ports/customer-volume.reader.js";
import type { PriceFloorReader } from "../../../../pricing/domain/ports/price-floor.reader.js";
import type { PriceRuleReader } from "../../../../pricing/domain/ports/price-rule.reader.js";
import type { SkuVolumeReader } from "../../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../../../pricing/domain/ports/volume-commitment.reader.js";
import type { VolumeLadderReader } from "../../../../pricing/domain/ports/volume-ladder.reader.js";
import type { VolumeCommitment } from "../../../../pricing/domain/volume-commitment.js";
import { CanonicalPriceHistoryReader } from "../../../domain/ports/canonical-price-history.reader.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../../../domain/ports/catalog.reader.js";
import { catalogItem, InMemoryCatalogOperations } from "../../__tests__/sale-operations-doubles.js";
import { ShopCataloguePricing } from "../../shop-catalogue-pricing.service.js";
import { ReadShopCatalogueHandler, ReadShopCatalogueQuery } from "../read-shop-catalogue.js";

/**
 * La vitrine sans jeton, publique ou pro (2026-10-19) — montée sur la VRAIE
 * porte de prix, doublée à ses ports : c'est elle qui dit ce qu'un visiteur
 * paie, et la doubler ferait éprouver le handler contre une fiction. Aucune
 * date n'est comparée au mur : l'horloge est figée et rien ne porte de fenêtre.
 */

const NOW = new Date(0);
const PRO_MILLICENTS = 200_000;
const PUBLIC_MILLICENTS = 250_237;

/** Le lecteur : rend la vitrine de l'audience demandée, et note laquelle. */
class SellableCatalog extends CatalogReader {
  readonly audiences: ShopAudience[] = [];

  constructor(
    private readonly byAudience: Readonly<Record<ShopAudience, readonly ResolvedCatalogItem[]>>,
  ) {
    super();
  }

  listSellable(audience: ShopAudience): Promise<ResolvedCatalogItem[]> {
    this.audiences.push(audience);
    return Promise.resolve([...this.byAudience[audience]]);
  }

  findSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  findDefaultByProductSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listDefaultsByProductSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.reject(new Error("lecture inattendue"));
  }
}

/** Les mercuriales : note pour QUI on les demande. Aucune n'est posée. */
class AskedMercuriales extends CompanyMercurialeReader {
  readonly askedFor: (string | null)[] = [];

  liveFor(companyId: string | null): Promise<CompanyMercuriale | null> {
    this.askedFor.push(companyId);
    return Promise.resolve(null);
  }
  liveAsOf(companyId: string | null): Promise<CompanyMercuriale | null> {
    this.askedFor.push(companyId);
    return Promise.resolve(null);
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.reject(new Error("lecture inattendue"));
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.reject(new Error("lecture inattendue"));
  }
}

/** Les engagements : note pour QUI on les demande. */
class AskedCommitments extends VolumeCommitmentReader {
  readonly askedFor: (string | null)[] = [];

  liveFor(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    this.askedFor.push(companyId);
    return Promise.resolve([]);
  }
  liveAsOf(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    this.askedFor.push(companyId);
    return Promise.resolve([]);
  }
}

const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

const noPriceRules: PriceRuleReader = {
  listArchived: () => Promise.resolve([]),
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noPriceFloors: PriceFloorReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noSkuVolumes: SkuVolumeReader = { volumesFor: () => Promise.resolve(new Map()) };

const noVolumeLadders: VolumeLadderReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noCustomerVolumes: CustomerVolumeReader = {
  volumesFor: () => Promise.resolve(new Map<string, number>()),
  committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
};

const BAGUETTE = "PAI-001";
const RESERVED = "PRO-001";

function fixture() {
  const catalog = new SellableCatalog({
    pro: [
      catalogItem(BAGUETTE, { unitPriceMillicents: PRO_MILLICENTS, isFeatured: true }),
      catalogItem(RESERVED, { audience: "pro" }),
    ],
    public: [catalogItem(BAGUETTE, { unitPriceMillicents: PUBLIC_MILLICENTS })],
  });
  const mercuriales = new AskedMercuriales();
  const commitments = new AskedCommitments();
  const pricer = new Pricer(
    new PricingMaterialsLoader(
      noPriceRules,
      mercuriales,
      noPriceFloors,
      noSkuVolumes,
      noVolumeLadders,
      commitments,
      noCustomerVolumes,
    ),
    new FixedClock(NOW),
    noPriceHistory,
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
  const pricing = new ShopCataloguePricing(
    catalog,
    pricer,
    new InMemoryCatalogOperations(),
    new FixedClock(NOW),
  );
  return { handler: new ReadShopCatalogueHandler(pricing), catalog, mercuriales, commitments };
}

describe("ReadShopCatalogueHandler", () => {
  it("sans audience : la vitrine PUBLIQUE, à l'étiquette publique", async () => {
    const { handler, catalog } = fixture();

    const view = await handler.execute(new ReadShopCatalogueQuery("fr"));

    expect(catalog.audiences).toEqual(["public"]);
    expect(view.items.map((item) => [item.sku, item.unitPriceMillicents])).toEqual([
      [BAGUETTE, PUBLIC_MILLICENTS],
    ]);
  });

  it("audience pro : le rayon des pros au tarif pro de BASE, hors taxe", async () => {
    const { handler, catalog } = fixture();

    const view = await handler.execute(new ReadShopCatalogueQuery("fr", "pro"));

    expect(catalog.audiences).toEqual(["pro"]);
    expect(view.items.map((item) => item.sku)).toEqual([BAGUETTE, RESERVED]);
    expect(view.items[0]).toMatchObject({
      unitPriceMillicents: PRO_MILLICENTS,
      isFeatured: true,
    });
    // Le TTC suit le HT servi : même dérivation que la vue d'un pro reconnu.
    expect(view.items[0]?.unitPriceTtcCents).toBe(211);
  });

  it("🔴 audience pro : la porte ne reçoit AUCUNE société — aucune mercuriale, aucun engagement lisible", async () => {
    const { handler, mercuriales, commitments } = fixture();

    await handler.execute(new ReadShopCatalogueQuery("fr", "pro"));

    expect(mercuriales.askedFor.every((companyId) => companyId === null)).toBe(true);
    expect(commitments.askedFor.every((companyId) => companyId === null)).toBe(true);
  });
});
