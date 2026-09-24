import { templateNameKey } from "../template-name.js";

describe("templateNameKey", () => {
  it("confond la casse et les accents — « Noël » et « noel » sont le même nom", () => {
    expect(templateNameKey("Noël")).toBe(templateNameKey("noel"));
    expect(templateNameKey("PÂQUES")).toBe("paques");
  });

  it("ignore les espaces autour, pas ceux du milieu", () => {
    expect(templateNameKey("  Bande Pâques  ")).toBe("bande paques");
    expect(templateNameKey("Bande Pâques")).not.toBe(templateNameKey("BandePâques"));
  });

  it("distingue deux noms réellement différents", () => {
    expect(templateNameKey("Noël")).not.toBe(templateNameKey("Nouvel an"));
  });
});
