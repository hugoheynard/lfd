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

    await expect(resolver.levelFor("customerMandate", null)).resolves.toBe("closed");
  });

  it("rend la dérogation posée pour tous", async () => {
    const resolver = new FeatureLevelResolver(new StubLookup({ customerMandate: "open" }, []));

    await expect(resolver.levelFor("customerMandate", null)).resolves.toBe("open");
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
