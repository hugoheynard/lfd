import { StaffAuthors, staffAuthorName, type StaffAuthor } from "../staff-author-directory.js";

const CAMILLE: StaffAuthor = {
  staffUserId: "staff_1",
  firstName: "Camille",
  lastName: "Durand",
  role: "commercial",
  roleLabel: "Commercial",
  jobTitle: "",
};

describe("StaffAuthors — nommer un auteur, quelle que soit sa forme", () => {
  const authors = new StaffAuthors(
    new Map([
      ["staff_1", CAMILLE],
      ["auth0|actuel", CAMILLE],
      ["auth0|ancien", CAMILLE],
    ]),
  );

  it("nomme pareil l'id de fiche, le `sub` actuel et un `sub` ancien", () => {
    expect(authors.nameOf("staff_1")).toBe("Camille Durand");
    expect(authors.nameOf("auth0|actuel")).toBe("Camille Durand");
    expect(authors.nameOf("auth0|ancien")).toBe("Camille Durand");
  });

  it("ne nomme ni un marqueur, ni `null` : l'écran garde la valeur brute", () => {
    expect(authors.nameOf("seed-pim")).toBeNull();
    expect(authors.nameOf("system")).toBeNull();
    expect(authors.nameOf(null)).toBeNull();
    expect(StaffAuthors.none().nameOf("staff_1")).toBeNull();
  });

  it("ne fabrique pas un nom vide pour une fiche sans nom", () => {
    expect(staffAuthorName({ ...CAMILLE, firstName: " ", lastName: "" })).toBeNull();
  });
});
