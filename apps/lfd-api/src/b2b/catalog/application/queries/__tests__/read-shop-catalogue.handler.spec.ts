import type { CatalogPricing, OrderCutoffView } from "@lfd/contracts";

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
import { ShopOrderCutoffsReader } from "../../../domain/ports/shop-order-cutoffs.reader.js";
import { CanonicalPriceHistoryReader } from "../../../domain/ports/canonical-price-history.reader.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../../../domain/ports/catalog.reader.js";
import { catalogItem, InMemoryCatalogOperations } from "../../__tests__/sale-operations-doubles.js";
import { GivenPricesPerKg } from "../../__tests__/price-per-kg-doubles.js";
import { ShopCataloguePricing } from "../../shop-catalogue-pricing.service.js";
import { ReadShopCatalogueHandler, ReadShopCatalogueQuery } from "../read-shop-catalogue.js";
import { GivenSaleSkuAliasTable } from "../../__tests__/sale-reference-intake.doubles.js";
import { P_X_ALIASED } from "../../../domain/__tests__/sale-sku-alias.doubles.js";
import type { SaleSkuAliasPair } from "../../../domain/sale-sku-aliases.js";

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

  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
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

/** Les heures limites en vigueur : celles qu'on lui donne. */
class GivenCutoffs extends ShopOrderCutoffsReader {
  constructor(private readonly rules: readonly OrderCutoffView[]) {
    super();
  }

  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rules);
  }
}

/** La règle générale de la boutique en production : la veille à 23 h. */
const GENERAL_EVE_23: OrderCutoffView = {
  id: "general",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "23:00",
  graceMinutes: 30,
};

const BAGUETTE = "PAI-001";
const RESERVED = "PRO-001";

function fixture(
  publicItems: readonly ResolvedCatalogItem[] = [
    catalogItem(BAGUETTE, { unitPriceMillicents: PUBLIC_MILLICENTS }),
  ],
  cutoffs: readonly OrderCutoffView[] = [GENERAL_EVE_23],
  aliases: readonly SaleSkuAliasPair[] = [],
) {
  const catalog = new SellableCatalog({
    pro: [
      catalogItem(BAGUETTE, { unitPriceMillicents: PRO_MILLICENTS, isFeatured: true }),
      catalogItem(RESERVED, { audience: "pro" }),
    ],
    public: publicItems,
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
    new GivenCutoffs(cutoffs),
    new GivenPricesPerKg(),
    new GivenSaleSkuAliasTable(aliases),
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

  describe("la limite propre d'un article (§9 de l'heure limite, 2026-10-21)", () => {
    const BUCHE = "BUC-001";
    const EVE_18 = "TAR-001";
    const SAME_DAY = "PAI-002";
    const items = [
      catalogItem(BUCHE, { orderTimeLimit: { daysBefore: 2, time: "12:00", graceMinutes: 15 } }),
      catalogItem(EVE_18, { orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 } }),
      catalogItem(SAME_DAY, { orderTimeLimit: { daysBefore: 0, time: "09:00", graceMinutes: 0 } }),
      catalogItem(BAGUETTE),
    ];
    const limitsOf = (view: Awaited<ReturnType<ReadShopCatalogueHandler["execute"]>>) =>
      view.items.map((item) => [item.sku, item.orderTimeLimit ?? null]);

    it("ne sert que les limites PLUS STRICTES que la générale, sans la grâce", async () => {
      const { handler } = fixture(items);

      const view = await handler.execute(new ReadShopCatalogueQuery("fr"));

      expect(limitsOf(view)).toEqual([
        [BUCHE, { daysBefore: 2, time: "12:00" }],
        [EVE_18, { daysBefore: 1, time: "18:00" }],
        [SAME_DAY, null],
        [BAGUETTE, null],
      ]);
    });

    it("🔴 la clé est ABSENTE du fil pour un article qui suit la règle générale", async () => {
      const { handler } = fixture(items);

      const view = await handler.execute(new ReadShopCatalogueQuery("fr"));

      expect(Object.keys(view.items[3] ?? {})).not.toContain("orderTimeLimit");
    });

    it("heure limite générale désactivée (aucune règle) : toute limite d'article se montre", async () => {
      const { handler } = fixture(items, []);

      const view = await handler.execute(new ReadShopCatalogueQuery("fr"));

      expect(limitsOf(view)[2]).toEqual([SAME_DAY, { daysBefore: 0, time: "09:00" }]);
    });

    it("une règle d'un seul jour n'est pas la règle générale", async () => {
      const { handler } = fixture(items, [{ ...GENERAL_EVE_23, weekday: "sun", daysBefore: 3 }]);

      const view = await handler.execute(new ReadShopCatalogueQuery("fr"));

      expect(limitsOf(view)[3]).toEqual([BAGUETTE, null]);
      expect(limitsOf(view)[1]).toEqual([EVE_18, { daysBefore: 1, time: "18:00" }]);
    });
  });

  describe("la table d'alias (plan-defaut-sous-sa-reference.md, § 5, L2)", () => {
    it("voyage avec la vitrine : la boutique normalise son panier avant d'élaguer", async () => {
      const { handler } = fixture(undefined, undefined, P_X_ALIASED);

      const view = await handler.execute(new ReadShopCatalogueQuery("fr"));

      expect(view.saleSkuAliases).toEqual([{ aliasSku: "P-X", targetSku: "P-X-1" }]);
    });

    it("est vide tant que la bascule n'a pas eu lieu", async () => {
      const { handler } = fixture();

      const view = await handler.execute(new ReadShopCatalogueQuery("fr", "pro"));

      expect(view.saleSkuAliases).toEqual([]);
    });
  });
});
