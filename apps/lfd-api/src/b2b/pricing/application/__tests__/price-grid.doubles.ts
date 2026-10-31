import type { CatalogPricing } from "@lfd/contracts";

import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { catalogueArticle } from "../../../catalog/domain/catalogue-article.js";
import { CanonicalPriceHistoryReader } from "../../../catalog/domain/ports/canonical-price-history.reader.js";
import {
  linePromotionSupply,
  FixedBasketPromotions,
  FixedCompanyStatuses,
  FixedPrincipals,
} from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { LinePromotionSupply } from "../../../promotions/application/line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "../../../promotions/application/promotion-audience-facts.resolver.js";
import type { LivePromotion } from "../../../promotions/domain/live-promotion.js";
import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { PriceGridFulfillmentNamer } from "../../domain/ports/price-grid-fulfillment.namer.js";
import {
  PriceGridServingReader,
  type PriceGridServing,
} from "../../domain/ports/price-grid-serving.reader.js";
import {
  PriceGridShelfReader,
  type PriceGridShelf,
  type PriceGridShelfArticle,
} from "../../domain/ports/price-grid-shelf.reader.js";
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import type { VolumeCommitment } from "../../domain/volume-commitment.js";
import { PriceGridContexts } from "../price-grid-context.js";
import { PriceGridPromotions } from "../price-grid-promotions.js";
import { Pricer } from "../pricer.js";
import { PricingMaterialsLoader } from "../pricing-materials.loader.js";
import { ownPricingParties } from "./pricing-parties.doubles.js";

/**
 * **Les doublés de la grille de prix** — chacun hérite du port qu'il joue.
 * La porte du prix est la VRAIE (`Pricer` + `PricingMaterialsLoader`),
 * doublée à ses ports : la grille ne doit rien prouver d'un tarificateur
 * imité.
 */

export const COMPANY = "co_folie";
export const PICKUP = "pt_coeur";
export const ZONE = "zn_vallee";

export class NamedCompanies extends PricedCompanyNamer {
  constructor(
    private readonly names: ReadonlyMap<string, string> = new Map([[COMPANY, "La Folie"]]),
  ) {
    super();
  }
  nameOf(companyId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(companyId) ?? null);
  }
}

export class NamedPlaces extends PriceGridFulfillmentNamer {
  pickupNameOf(pickupId: string): Promise<string | null> {
    return Promise.resolve(pickupId === PICKUP ? "Cœur de station" : null);
  }
  zoneNameOf(zoneId: string): Promise<string | null> {
    return Promise.resolve(zoneId === ZONE ? "Vallée" : null);
  }
}

/** Une société servie en pro, qui paie son propre tarif ; sans société, le public. */
export class GivenServing extends PriceGridServingReader {
  constructor(private readonly proCompanies: ReadonlySet<string> = new Set([COMPANY])) {
    super();
  }
  servingOf(companyId: string | null): Promise<PriceGridServing> {
    return Promise.resolve(
      companyId !== null && this.proCompanies.has(companyId)
        ? { basis: "ht", pricingCompanyId: companyId }
        : { basis: "ttc", pricingCompanyId: null },
    );
  }
}

/** Un article du rayon, scellé comme le catalogue le scelle. */
export function shelfArticle(sku: string, unitPriceMillicents: number): PriceGridShelfArticle {
  return {
    article: catalogueArticle({
      sku,
      name: `Article ${sku}`,
      categoryPath: ["fam-vien"],
      unitPriceMillicents,
      saleUnit: "piece",
    }),
    familyName: "Viennoiseries",
    productName: `Fiche ${sku}`,
    vatRate: 5.5,
    enteredPerKg: { proHtMillicents: null, publicTtcCents: null },
  };
}

/** Le rayon donné, dont l'assiette suit le service — et ce qu'on lui a demandé. */
export class GivenShelf extends PriceGridShelfReader {
  readonly asked: { readonly companyId: string | null; readonly at: Date }[] = [];

  constructor(
    private readonly articles: readonly PriceGridShelfArticle[],
    private readonly serving: PriceGridServingReader = new GivenServing(),
  ) {
    super();
  }

  async shelfFor(companyId: string | null, at: Date): Promise<PriceGridShelf> {
    this.asked.push({ companyId, at });
    return { ...(await this.serving.servingOf(companyId)), articles: this.articles };
  }
}

/** Les mercuriales posées, et à qui on les a demandées — présent ou relecture. */
export class RecordingMercuriales extends CompanyMercurialeReader {
  readonly asked: { readonly companyId: string | null; readonly replay: boolean }[] = [];

  constructor(private readonly mercuriales: readonly CompanyMercuriale[] = []) {
    super();
  }
  liveFor(companyId: string | null): Promise<CompanyMercuriale | null> {
    this.asked.push({ companyId, replay: false });
    return Promise.resolve(this.of(companyId));
  }
  liveAsOf(companyId: string | null): Promise<CompanyMercuriale | null> {
    this.asked.push({ companyId, replay: true });
    return Promise.resolve(this.of(companyId));
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve(this.mercuriales);
  }
  private of(companyId: string | null): CompanyMercuriale | null {
    return this.mercuriales.find((mercuriale) => mercuriale.companyId === companyId) ?? null;
  }
}

class NoCommitments extends VolumeCommitmentReader {
  liveFor(): Promise<readonly VolumeCommitment[]> {
    return Promise.resolve([]);
  }
  liveAsOf(): Promise<readonly VolumeCommitment[]> {
    return Promise.resolve([]);
  }
}

/** L'historique du tarif : le prix d'aujourd'hui pour chaque SKU donné, depuis toujours. */
class GivenHistory extends CanonicalPriceHistoryReader {
  constructor(private readonly pricing: ReadonlyMap<string, CatalogPricing>) {
    super();
  }
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(this.pricing);
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(new Date(0));
  }
}

const none = () => Promise.resolve([]);

/** La VRAIE porte du prix, sur ces mercuriales et ces promotions de ligne. */
export function realPricer(
  now: Date,
  mercuriales: CompanyMercurialeReader,
  lines: LinePromotionSupply = linePromotionSupply([]),
  history: ReadonlyMap<string, CatalogPricing> = new Map(),
): Pricer {
  return new Pricer(
    new PricingMaterialsLoader(
      { listArchived: none, inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      mercuriales,
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      { volumesFor: () => Promise.resolve(new Map()) },
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      new NoCommitments(),
      {
        volumesFor: () => Promise.resolve(new Map<string, number>()),
        committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
      },
      lines,
    ),
    new FixedClock(now),
    new GivenHistory(history),
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
}

/** Une mercuriale à un prix sur un SKU, avec sa politique de promotions. */
export function mercurialeOn(
  sku: string,
  unitPriceMillicents: number,
  promotionPolicy: Parameters<typeof CompanyMercuriale.pose>[1]["promotionPolicy"],
): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: COMPANY,
      label: "Mercuriale",
      lines: [{ sku, tiers: [{ minQuantity: 1, unitPriceMillicents }] }],
      validFrom: new Date(0),
      validTo: null,
      promotionPolicy,
    },
    "staff",
  );
}

/** Les contextes et les promotions de la grille, sur l'horloge donnée. */
export function gridServices(
  now: Date,
  options: {
    readonly lines?: readonly LivePromotion[];
    readonly basket?: readonly LivePromotion[];
    readonly statuses?: ReadonlyMap<string, StandingCompanyStatus>;
  } = {},
): { readonly contexts: PriceGridContexts; readonly promotions: PriceGridPromotions } {
  const statuses = new FixedCompanyStatuses(options.statuses ?? new Map([[COMPANY, "active"]]));
  return {
    contexts: new PriceGridContexts(
      new FixedClock(now),
      new NamedCompanies(),
      new NamedPlaces(),
      new GivenServing(),
    ),
    promotions: new PriceGridPromotions(
      linePromotionSupply(options.lines ?? [], statuses),
      new FixedBasketPromotions(options.basket ?? []),
      new PromotionAudienceFactsResolver(statuses, new FixedPrincipals()),
    ),
  };
}
