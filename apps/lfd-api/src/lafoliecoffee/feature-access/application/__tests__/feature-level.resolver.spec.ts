import { FeatureLevelLookup } from "../../domain/ports/feature-level.lookup.js";
import { FeatureLevelResolver } from "../feature-level.resolver.js";

/** Une base en mémoire : une dérogation par clé, des adresses et des sociétés exemptées. */
class StubLookup extends FeatureLevelLookup {
  readonly asked: string[] = [];

  constructor(
    private readonly overrides: Readonly<Record<string, string>>,
    private readonly exempt: readonly string[],
    private readonly exemptCompanies: readonly string[] = [],
  ) {
    super();
  }

  storedOverride(key: string): Promise<string | null> {
    this.asked.push(`override:${key}`);
    return Promise.resolve(this.overrides[key] ?? null);
  }

  storedOverrides(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
    this.asked.push(`overrides:${keys.join(",")}`);
    return Promise.resolve(
      new Map(
        keys.flatMap((key) => (key in this.overrides ? [[key, this.overrides[key] ?? ""]] : [])),
      ),
    );
  }

  isExempt(key: string, normalizedEmail: string): Promise<boolean> {
    this.asked.push(`exempt:${key}:${normalizedEmail}`);
    return Promise.resolve(this.exempt.includes(normalizedEmail));
  }

  isCompanyExempt(key: string, companyId: string): Promise<boolean> {
    this.asked.push(`company:${key}:${companyId}`);
    return Promise.resolve(this.exemptCompanies.includes(companyId));
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

  it("masque la connexion par Facebook par défaut, et la montre quand on la pose", async () => {
    await expect(
      new FeatureLevelResolver(new StubLookup({}, [])).levelFor("facebookLogin", null),
    ).resolves.toBe("hidden");
    await expect(
      new FeatureLevelResolver(new StubLookup({ facebookLogin: "visible" }, [])).levelFor(
        "facebookLogin",
        null,
      ),
    ).resolves.toBe("visible");
  });

  /** L'écran de connexion précède toute identité : aucune adresse ne compte. */
  it("ne cherche aucune exemption pour la connexion par Facebook", async () => {
    const lookup = new StubLookup({}, ["testeur@exemple.fr"]);

    await expect(
      new FeatureLevelResolver(lookup).levelFor("facebookLogin", {
        email: "testeur@exemple.fr",
        emailProven: true,
      }),
    ).resolves.toBe("hidden");
    expect(lookup.asked).toEqual(["override:facebookLogin"]);
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

describe("FeatureLevelResolver — le planificateur, exempté société par société", () => {
  it("s'ouvre pour la société exemptée, sans lire la dérogation", async () => {
    const lookup = new StubLookup({ orderPlanner: "closed" }, [], ["co_chalet"]);
    await expect(
      new FeatureLevelResolver(lookup).levelForCompany("orderPlanner", "co_chalet"),
    ).resolves.toBe("open");
    expect(lookup.asked).toEqual(["company:orderPlanner:co_chalet"]);
  });

  it("reste fermé pour une autre société, et suit alors la dérogation", async () => {
    const lookup = new StubLookup({}, [], ["co_chalet"]);
    await expect(
      new FeatureLevelResolver(lookup).levelForCompany("orderPlanner", "co_bistrot"),
    ).resolves.toBe("closed");
    await expect(
      new FeatureLevelResolver(new StubLookup({ orderPlanner: "open" }, [])).levelForCompany(
        "orderPlanner",
        "co_bistrot",
      ),
    ).resolves.toBe("open");
  });

  /** Une clé qui ne s'exempte pas par société ne regarde pas la liste. */
  it("ne cherche aucune société pour le mandat client", async () => {
    const lookup = new StubLookup({}, [], ["co_chalet"]);
    await expect(
      new FeatureLevelResolver(lookup).levelForCompany("customerMandate", "co_chalet"),
    ).resolves.toBe("closed");
    expect(lookup.asked).toEqual(["override:customerMandate"]);
  });

  /** `/me` et la garde ne s'égalent plus pour cette clé : l'adresse n'ouvre rien. */
  it("ne cherche pas l'adresse, même prouvée et inscrite", async () => {
    const lookup = new StubLookup({}, ["chef@exemple.fr"]);
    await expect(
      new FeatureLevelResolver(lookup).levelFor("orderPlanner", {
        email: "chef@exemple.fr",
        emailProven: true,
      }),
    ).resolves.toBe("closed");
    expect(lookup.asked).toEqual(["override:orderPlanner"]);
  });
});

describe("FeatureLevelResolver.levelsFor — tous les niveaux d'un coup", () => {
  it("rend les défauts du code quand la base est vide", async () => {
    await expect(new FeatureLevelResolver(new StubLookup({}, [])).levelsFor(null)).resolves.toEqual(
      {
        customerMandate: "closed",
        facebookLogin: "hidden",
        proSignupCallback: "hidden",
        orderPlanner: "closed",
      },
    );
  });

  /**
   * Une lecture des dérogations suffit ; aucune clé ne s'exempte par adresse,
   * et le planificateur y vaut son niveau GLOBAL (`/me` n'a pas d'espace).
   */
  it("lit les dérogations en UNE fois, et sert le planificateur au niveau global", async () => {
    const lookup = new StubLookup({ facebookLogin: "visible", customerMandate: "open" }, [
      "testeur@exemple.fr",
    ]);

    const levels = await new FeatureLevelResolver(lookup).levelsFor({
      email: "testeur@exemple.fr",
      emailProven: true,
    });

    expect(levels).toMatchObject({
      customerMandate: "open",
      facebookLogin: "visible",
      orderPlanner: "closed",
    });
    expect(lookup.asked).toEqual([
      "overrides:customerMandate,facebookLogin,proSignupCallback,orderPlanner",
    ]);
  });

  it("rend le défaut d'une clé quand sa dérogation n'est pas un niveau de la clé", async () => {
    const lookup = new StubLookup({ customerMandate: "visible" }, []);

    await expect(new FeatureLevelResolver(lookup).levelsFor(null)).resolves.toMatchObject({
      customerMandate: "closed",
    });
  });
});
