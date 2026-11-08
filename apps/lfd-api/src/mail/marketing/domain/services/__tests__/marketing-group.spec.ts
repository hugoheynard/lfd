import { groupIsOffered, MARKETING_SPACES } from "../marketing-group.js";

describe("groupIsOffered (règle 19)", () => {
  it("aujourd'hui, aucun espace n'est marketing : « tout le groupe » n'est pas proposé", () => {
    expect(MARKETING_SPACES).toEqual([]);
    expect(groupIsOffered()).toBe(false);
  });

  it("un seul espace marketing ne fait pas un groupe ; deux, si", () => {
    expect(groupIsOffered(["lfc"])).toBe(false);
    expect(groupIsOffered(["lfc", "lfd"])).toBe(true);
  });
});
