import { FeatureLevelLookup } from "../../domain/ports/feature-level.lookup.js";
import { FeatureLevelResolver } from "../feature-level.resolver.js";

/** Une base en mémoire : une dérogation par clé, des adresses exemptées par clé. */
class StubLookup extends FeatureLevelLookup {
  readonly asked: string[] = [];

  constructor(
    private readonly overrides: Readonly<Record<string, string>>,
    private readonly exempt: readonly string[],
  ) {
    super();
  }

  storedOverride(key: string): Promise<string | null> {
    this.asked.push(`override:${key}`);
    return Promise.resolve(this.overrides[key] ?? null);
  }

  isExempt(key: string, normalizedEmail: string): Promise<boolean> {
    this.asked.push(`exempt:${key}:${normalizedEmail}`);
    return Promise.resolve(this.exempt.includes(normalizedEmail));
  }
}

describe("FeatureLevelResolver.levelFor", () => {
  it("rend le défaut du code quand la base est vide", async () => {
    const resolver = new FeatureLevelResolver(new StubLookup({}, []));

    await expect(resolver.levelFor("shop", null)).resolves.toBe("order");
  });

  it("rend la dérogation à qui n'est pas exempté", async () => {
    const resolver = new FeatureLevelResolver(new StubLookup({ shop: "closed" }, []));

    await expect(
      resolver.levelFor("shop", { email: "client@exemple.fr", emailProven: true }),
    ).resolves.toBe("closed");
  });

  it("ouvre tout à une adresse prouvée ET exemptée, et ne lit pas la dérogation", async () => {
    const lookup = new StubLookup({ shop: "closed" }, ["testeur@exemple.fr"]);
    const resolver = new FeatureLevelResolver(lookup);

    await expect(
      resolver.levelFor("shop", { email: " Testeur@Exemple.fr", emailProven: true }),
    ).resolves.toBe("order");
    expect(lookup.asked).toEqual(["exempt:shop:testeur@exemple.fr"]);
  });

  it("ignore l'exemption d'une adresse NON prouvée — sans même la chercher", async () => {
    // Régression à ne pas laisser passer : s'inscrire avec l'adresse d'un
    // testeur suffirait sinon à rouvrir la boutique.
    const lookup = new StubLookup({ shop: "closed" }, ["testeur@exemple.fr"]);
    const resolver = new FeatureLevelResolver(lookup);

    await expect(
      resolver.levelFor("shop", { email: "testeur@exemple.fr", emailProven: false }),
    ).resolves.toBe("closed");
    expect(lookup.asked).toEqual(["override:shop"]);
  });

  it("ne cherche aucune exemption sans personne connectée", async () => {
    const lookup = new StubLookup({ shop: "browse" }, ["testeur@exemple.fr"]);

    await expect(new FeatureLevelResolver(lookup).levelFor("shop", null)).resolves.toBe("browse");
    expect(lookup.asked).toEqual(["override:shop"]);
  });
});

describe("FeatureLevelResolver — une clé qu'aucune exemption n'ouvre", () => {
  it("ne cherche pas l'adresse, même prouvée et inscrite", async () => {
    const lookup = new StubLookup({}, ["testeur@exemple.fr"]);

    await expect(
      new FeatureLevelResolver(lookup).levelFor("customerMandate", {
        email: "testeur@exemple.fr",
        emailProven: true,
      }),
    ).resolves.toBe("closed");
    expect(lookup.asked).toEqual(["override:customerMandate"]);
  });

  it("se lit SANS sujet, fermée par défaut", async () => {
    const lookup = new StubLookup({}, []);

    await expect(
      new FeatureLevelResolver(lookup).unexemptibleLevelOf("customerMandate"),
    ).resolves.toBe("closed");
    expect(lookup.asked).toEqual(["override:customerMandate"]);
  });

  it("suit la dérogation posée pour tous", async () => {
    const lookup = new StubLookup({ customerMandate: "open" }, []);

    await expect(
      new FeatureLevelResolver(lookup).unexemptibleLevelOf("customerMandate"),
    ).resolves.toBe("open");
  });
});
