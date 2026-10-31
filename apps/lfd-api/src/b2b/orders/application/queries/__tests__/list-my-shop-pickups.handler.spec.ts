import type { AudiencePickupDiscount, PickupAddressView } from "@lfd/contracts";

import {
  FIELDS,
  FilteringPickups,
} from "../../../../pickup-addresses/application/__tests__/pickup-address-doubles.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { ListMyShopPickupsHandler } from "../list-my-shop-pickups.handler.js";
import { ListMyShopPickupsQuery } from "../list-my-shop-pickups.query.js";

const percent = (bp: number): AudiencePickupDiscount => ({
  adjustment: { mode: "percent", bp },
  scope: "all_except",
  categories: [],
  products: [],
});

const PRO = percent(1500);
const PENDING = percent(1200);
const INDIVIDUAL = percent(500);

const point = (id: string, pickupAudiences: { b2b: boolean; b2c: boolean }): PickupAddressView => ({
  ...FIELDS,
  id,
  label: id,
  discounts: { b2b: PRO, b2bPending: PENDING, b2c: INDIVIDUAL },
  pickupAudiences,
  gps: null,
});

const POINTS = [point("Labo", { b2b: true, b2c: true }), point("Pros", { b2b: true, b2c: false })];

/** Le statut de toute société demandée. */
class FixedCompanyStatus extends CompanyStatusReader {
  constructor(private readonly status: OrderCompanyStatus | null) {
    super();
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(this.status);
  }
}

async function listFor(
  companyId: string | null,
  status: OrderCompanyStatus | null,
): Promise<{ readonly labels: string[]; readonly discounts: unknown[]; readonly json: string }> {
  const handler = new ListMyShopPickupsHandler(
    new CustomerAudiences(new FixedCompanyStatus(status)),
    new FilteringPickups(POINTS),
  );
  const listed = await handler.execute(new ListMyShopPickupsQuery(companyId));
  return {
    labels: listed.map((p) => p.label),
    discounts: listed.map((p) => p.discount),
    json: JSON.stringify(listed),
  };
}

const PER_CLIENTELE_KEY = /"(b2b|b2bPending|b2c|discounts|pickupAudiences)"/u;

describe("ListMyShopPickupsHandler — l'audience établie, et elle seule", () => {
  it("un pro d'une société active : les points des pros, la remise pro", async () => {
    const served = await listFor("c1", "active");

    expect(served.labels).toEqual(["Labo", "Pros"]);
    expect(served.discounts).toEqual([PRO, PRO]);
    expect(served.json).not.toMatch(PER_CLIENTELE_KEY);
  });

  it("une société en attente : la remise des pros en cours d'inscription", async () => {
    const served = await listFor("c1", "pending");

    expect(served.labels).toEqual(["Labo"]);
    expect(served.discounts).toEqual([PENDING]);
    expect(served.json).not.toMatch(PER_CLIENTELE_KEY);
  });

  it("l'espace perso : la remise des particuliers", async () => {
    const served = await listFor(null, null);

    expect(served.labels).toEqual(["Labo"]);
    expect(served.discounts).toEqual([INDIVIDUAL]);
  });
});
