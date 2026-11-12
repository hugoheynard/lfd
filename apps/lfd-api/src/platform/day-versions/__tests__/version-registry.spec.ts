import {
  DayVersionRegistry,
  DayVersionRegistryMisassembledError,
} from "../day-version-registry.js";
import { GLOBAL_SCOPE } from "../day-versions-cache.js";
import { VersionRegistry } from "../version-registry.js";
import { globalSources, sources } from "./day-versions-doubles.js";

function days(): DayVersionRegistry {
  return new DayVersionRegistry(Object.values(sources()));
}

describe("VersionRegistry — les sujets, journaliers et globaux", () => {
  it("rend les droits d'un sujet, de l'une ou l'autre portée", () => {
    const registry = new VersionRegistry(days(), Object.values(globalSources()));

    expect(registry.readersOf("companies")).toEqual(["b2b_companies:read"]);
    expect(registry.readersOf("orders-all")).toEqual(["b2b_orders:read"]);
    expect(registry.readersOf("catalog-admin")).toEqual(["lfc_catalog:read"]);
    expect(registry.readersOf("production")).toEqual(["production_plan:read"]);
  });

  it("range chaque sujet dans SA portée", () => {
    const registry = new VersionRegistry(days(), Object.values(globalSources()));

    expect(registry.subjectsOf(GLOBAL_SCOPE).map((one) => one.subject)).toEqual([
      "companies",
      "orders-all",
      "catalog-admin",
    ]);
    expect(registry.subjectsOf("2030-03-12").map((one) => one.subject)).toEqual([
      "orders",
      "production",
      "delivery",
      "my-round",
    ]);
  });

  it("porte la fenêtre propre à chaque sujet", () => {
    const registry = new VersionRegistry(days(), Object.values(globalSources()));

    expect(
      Object.fromEntries(
        registry.subjectsOf(GLOBAL_SCOPE).map((one) => [one.subject, one.freshMs]),
      ),
    ).toEqual({ companies: 30_000, "orders-all": 15_000, "catalog-admin": 15_000 });
  });

  it("refuse de se construire quand un sujet global n'a pas de source", () => {
    const build = () => new VersionRegistry(days(), [globalSources().companies]);

    expect(build).toThrow(DayVersionRegistryMisassembledError);
    expect(build).toThrow(/« orders-all »/u);
  });

  it("refuse de se construire quand un sujet global a deux sources", () => {
    const all = globalSources();
    const build = () =>
      new VersionRegistry(days(), [
        all.companies,
        all["orders-all"],
        all["catalog-admin"],
        globalSources().companies,
      ]);

    expect(build).toThrow(/« companies » a deux sources/u);
  });
});
