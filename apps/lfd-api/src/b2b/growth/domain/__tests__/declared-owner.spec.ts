import { declaredOwnerOf } from "../declared-owner.js";

/**
 * Le détenteur d'une déclaration se lit sous les deux formes que la base
 * garde : l'id seul (avant le lot B du plan des phrases), l'objet nommé
 * (depuis). Le journal ne se réécrit pas — le lecteur lit les deux.
 */
describe("declaredOwnerOf", () => {
  it("lit la forme d'avant, l'id seul", () => {
    expect(declaredOwnerOf({ via: "self", ownerUserId: "user_1" })).toBe("user_1");
  });

  it("lit la forme courante, la personne citée avec son nom", () => {
    expect(
      declaredOwnerOf({
        subjectLabel: "Café",
        via: "self",
        owner: { id: "user_1", name: "C. R." },
      }),
    ).toBe("user_1");
  });

  it("rend null pour une déclaration du staff, sans détenteur, sous l'une ou l'autre forme", () => {
    expect(declaredOwnerOf({ via: "staff", ownerUserId: null })).toBeNull();
    expect(declaredOwnerOf({ subjectLabel: "Café", via: "staff", owner: null })).toBeNull();
  });
});
