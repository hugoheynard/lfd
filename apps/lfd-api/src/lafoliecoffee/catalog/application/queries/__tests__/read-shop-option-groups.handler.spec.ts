import { CatalogViewers } from "../../catalog-viewers.service.js";
import type { CatalogOptionGroup } from "../../../domain/option-groups/catalog-option-groups.js";
import {
  ServedCompanyReader,
  type ServedCompany,
} from "../../../domain/ports/served-company.reader.js";
import { InMemoryShelfOptionGroups } from "../../../infrastructure/in-memory-shelf-option-groups.js";
import { ReadShopOptionGroupsHandler } from "../read-shop-option-groups.handler.js";
import { ReadShopOptionGroupsQuery } from "../read-shop-option-groups.query.js";

const PRO_COMPANY = "co_pro";

/** Une seule société, active : servie aux pros. Toute autre est inconnue (le public). */
class OneActiveCompany extends ServedCompanyReader {
  servedOf(companyId: string): Promise<ServedCompany | null> {
    return Promise.resolve(
      companyId === PRO_COMPANY
        ? {
            status: "active",
            archivedAt: null,
            holders: { companyId, activePrincipalId: null },
            principalId: null,
            menu: null,
          }
        : null,
    );
  }
}

const SLICING: CatalogOptionGroup = {
  id: "grp_slicing",
  name: "Tranchage",
  choices: [
    { key: "sliced", label: "tranché", audience: "both" },
    { key: "thin", label: "tranché fin", audience: "pro" },
  ],
};
const WRAPPING: CatalogOptionGroup = {
  id: "grp_wrap",
  name: "Emballage",
  choices: [{ key: "gift", label: "paquet cadeau", audience: "public" }],
};

function rig() {
  const options = new InMemoryShelfOptionGroups(
    new Map([
      ["PAIN-B", [SLICING]],
      ["PAIN-A", [SLICING, WRAPPING]],
    ]),
  );
  return {
    options,
    handler: new ReadShopOptionGroupsHandler(options, new CatalogViewers(new OneActiveCompany())),
  };
}

describe("ReadShopOptionGroupsHandler — les options à la clientèle que le serveur résout", () => {
  it("sert au visiteur les seuls choix du public, triés par SKU", async () => {
    const { handler } = rig();

    const view = await handler.execute(
      new ReadShopOptionGroupsQuery({ kind: "visitor", audience: "public" }),
    );

    expect(view.items).toEqual([
      {
        sku: "PAIN-A",
        groups: [
          { id: "grp_slicing", name: "Tranchage", choices: [{ key: "sliced", label: "tranché" }] },
          { id: "grp_wrap", name: "Emballage", choices: [{ key: "gift", label: "paquet cadeau" }] },
        ],
      },
      {
        sku: "PAIN-B",
        groups: [
          { id: "grp_slicing", name: "Tranchage", choices: [{ key: "sliced", label: "tranché" }] },
        ],
      },
    ]);
  });

  it("sert à un client reconnu d'une société pro les choix des pros, et retire un groupe vide", async () => {
    const { handler, options } = rig();

    const view = await handler.execute(
      new ReadShopOptionGroupsQuery({ kind: "recognised", companyId: PRO_COMPANY }),
    );

    expect(options.audiences).toEqual(["pro"]);
    expect(view.items.find((item) => item.sku === "PAIN-A")?.groups.map((g) => g.id)).toEqual([
      "grp_slicing",
    ]);
    expect(view.items[0]?.groups[0]?.choices.map((c) => c.key)).toEqual(["sliced", "thin"]);
  });

  it("sert l'espace perso (sans société) comme le public", async () => {
    const { handler, options } = rig();

    await handler.execute(new ReadShopOptionGroupsQuery({ kind: "recognised", companyId: null }));

    expect(options.audiences).toEqual(["public"]);
  });
});
