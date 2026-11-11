import type { StandingCompanyStatus } from "../../../../shared/company-standing/domain/company-standing.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecognisedShelf } from "../../../../catalog/application/recognised-shelf.service.js";
import {
  HEAD,
  SHELF_NOW,
  SITE,
  shelfComputation,
} from "../../../../catalog/application/__tests__/recognised-shelf-fixture.js";
import { resilientAround } from "../../../../catalog/application/__tests__/shelf-cache-doubles.js";
import {
  ServedCompanyReader,
  type ServedCompany,
} from "../../../../catalog/domain/ports/served-company.reader.js";
import { NoShopShelfCache } from "../../../../catalog/infrastructure/no-shop-shelf-cache.js";
import { OrderCompanyNotFoundError } from "../../../domain/errors/order-errors.js";
import { StaffEntryCompanyClosedError } from "../../../domain/errors/staff-entry-company-closed.error.js";
import {
  ReadCustomerShelfPricesHandler,
  ReadCustomerShelfPricesQuery,
} from "../read-customer-shelf-prices.js";

const UNKNOWN = "co_unknown";
const CLOSED = "co_closed";

/** Les sociétés connues de la saisie : une inconnue rend `null`. */
class GivenCompanies extends ServedCompanyReader {
  constructor(private readonly statuses: ReadonlyMap<string, StandingCompanyStatus>) {
    super();
  }

  servedOf(companyId: string): Promise<ServedCompany | null> {
    const status = this.statuses.get(companyId);
    return Promise.resolve(
      status === undefined
        ? null
        : { status, holders: { companyId, activePrincipalId: null }, principalId: null },
    );
  }
}

function rig() {
  const computation = shelfComputation();
  const shelf = new RecognisedShelf(
    computation.pricing,
    resilientAround(new NoShopShelfCache()).resilient,
    new FixedClock(SHELF_NOW),
  );
  const companies = new GivenCompanies(
    new Map<string, StandingCompanyStatus>([
      [HEAD, "active"],
      [SITE, "active"],
      [CLOSED, "terminated"],
    ]),
  );
  return { handler: new ReadCustomerShelfPricesHandler(companies, shelf), shelf, computation };
}

describe("ReadCustomerShelfPricesHandler — la liste de l'équipe au prix du client", () => {
  it("refuse une société inconnue par un 404, sans lire le rayon", async () => {
    const { handler, computation } = rig();

    await expect(handler.execute(new ReadCustomerShelfPricesQuery(UNKNOWN))).rejects.toBeInstanceOf(
      OrderCompanyNotFoundError,
    );
    expect(computation.catalog.reads).toBe(0);
  });

  it("refuse une société terminée par le refus de la passation, sans lire le rayon", async () => {
    const { handler, computation } = rig();

    await expect(handler.execute(new ReadCustomerShelfPricesQuery(CLOSED))).rejects.toBeInstanceOf(
      StaffEntryCompanyClosedError,
    );
    expect(computation.catalog.reads).toBe(0);
  });

  it.each([HEAD, SITE])("reprend le rayon reconnu de %s, SKU par SKU", async (companyId) => {
    const { handler, shelf } = rig();

    const table = await handler.execute(new ReadCustomerShelfPricesQuery(companyId));
    const view = await shelf.read(companyId);

    expect(table.audience).toBe("pro");
    expect(table.items).toEqual(
      view.items.map((item) => ({
        sku: item.sku,
        unitPriceMillicents: item.unitPriceMillicents,
        struckFromMillicents: item.catalogPriceMillicents ?? null,
        unitPriceTtcCents: item.unitPriceTtcCents,
        struckFromTtcCents: item.catalogPriceTtcCents ?? null,
        lockedReason: item.lockedReason ?? null,
      })),
    );
  });

  it("porte le prix négocié et barre le tarif pour la société à mercuriale", async () => {
    const { handler } = rig();

    const table = await handler.execute(new ReadCustomerShelfPricesQuery(HEAD));
    const negotiated = table.items.find((item) => item.unitPriceMillicents === 150_000);

    expect(negotiated?.struckFromMillicents).not.toBeNull();
    expect(negotiated?.struckFromTtcCents).not.toBeNull();
    expect(table.items.some((item) => item.struckFromMillicents === null)).toBe(true);
  });
});
