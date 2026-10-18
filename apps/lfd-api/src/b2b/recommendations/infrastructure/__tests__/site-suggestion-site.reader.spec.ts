import type { StoredSiteView } from "@lfd/contracts";

import { SiteReader } from "../../../sites/domain/site.reader.js";
import {
  SiteSuggestionSiteChoicesReader,
  SiteSuggestionSiteReader,
} from "../site-suggestion-site.reader.js";

function site(id: string, overrides: Partial<StoredSiteView> = {}): StoredSiteView {
  return {
    id,
    label: `Site ${id}`,
    ligne1: "1 rue du Four",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "FR",
    discount: null,
    discountAudiences: { b2b: true, b2c: true },
    opening: { publicOpening: null, proPickup: null },
    pickup: true,
    supply: "on_site",
    deliveryDeparture: false,
    transferMode: "integrated",
    counterSetupMinutes: 0,
    eatIn: false,
    gps: null,
    archivedAt: null,
    pickupColorB2b: null,
    pickupColorB2c: null,
    deliveryColorB2b: null,
    deliveryColorB2c: null,
    ...overrides,
  };
}

class FixedSites extends SiteReader {
  constructor(private readonly sites: readonly StoredSiteView[]) {
    super();
  }
  list(): Promise<readonly StoredSiteView[]> {
    return Promise.resolve(this.sites);
  }
  get(id: string): Promise<StoredSiteView | null> {
    return Promise.resolve(this.sites.find((one) => one.id === id) ?? null);
  }
}

/** Un point archivé, un site qui ne remet pas : ni l'un ni l'autre n'est ouvert (RS8). */
const SITES = new FixedSites([
  site("a"),
  site("archived", { archivedAt: "2026-10-01T08:00:00.000Z" }),
  site("lab", { pickup: false }),
]);

describe("SiteSuggestionSiteReader", () => {
  it("ne garde que les points ouverts parmi ceux demandés", async () => {
    const open = await new SiteSuggestionSiteReader(SITES).openAmong([
      "a",
      "archived",
      "lab",
      "inconnu",
    ]);
    expect([...open]).toEqual(["a"]);
  });
});

describe("SiteSuggestionSiteChoicesReader", () => {
  it("propose les seuls points ouverts, par leur nom", async () => {
    expect(await new SiteSuggestionSiteChoicesReader(SITES).openSites()).toEqual([
      { id: "a", label: "Site a" },
    ]);
  });
});
