import { optionGroupsOfferedTo, type CatalogOptionGroup } from "../catalog-option-groups.js";

const SLICING: CatalogOptionGroup = {
  id: "og_slicing",
  name: "Tranchage",
  choices: [
    { key: "sliced", label: "tranché", audience: "both" },
    { key: "thin", label: "tranché fin", audience: "pro" },
    { key: "gift", label: "paquet cadeau", audience: "public" },
  ],
};
const PRO_ONLY: CatalogOptionGroup = {
  id: "og_crate",
  name: "Caisse",
  choices: [{ key: "crate", label: "en caisse", audience: "pro" }],
};

describe("optionGroupsOfferedTo — chaque audience, son information", () => {
  it("un pro voit les choix pro et partagés, dans leur ordre", () => {
    expect(optionGroupsOfferedTo([SLICING, PRO_ONLY], "pro")).toEqual([
      {
        id: "og_slicing",
        name: "Tranchage",
        choices: [
          { key: "sliced", label: "tranché" },
          { key: "thin", label: "tranché fin" },
        ],
      },
      { id: "og_crate", name: "Caisse", choices: [{ key: "crate", label: "en caisse" }] },
    ]);
  });

  it("🔴 un particulier ne reçoit jamais un choix réservé aux pros, ni un groupe vide pour lui", () => {
    expect(optionGroupsOfferedTo([SLICING, PRO_ONLY], "public")).toEqual([
      {
        id: "og_slicing",
        name: "Tranchage",
        choices: [
          { key: "sliced", label: "tranché" },
          { key: "gift", label: "paquet cadeau" },
        ],
      },
    ]);
  });
});
