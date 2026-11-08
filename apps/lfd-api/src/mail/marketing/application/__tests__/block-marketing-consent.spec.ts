import { marketingWorld, NOW } from "./marketing-world.js";

describe("BlockMarketingConsent — le canal (règle 12)", () => {
  it("jamais demandé : `null`", async () => {
    expect(await marketingWorld().consent.preferenceOf("lfc", "colette@halles.fr")).toBeNull();
  });

  it("désinscrit à la demande du staff, la même adresse quelle que soit sa casse", async () => {
    const w = marketingWorld();

    await w.consent.unsubscribe("lfc", "Colette@Halles.FR", "staff");

    expect(await w.consent.preferenceOf("lfc", "colette@halles.fr")).toBe("unsubscribed");
    const [row] = await w.preferences.loadAll(w.addresses.of("colette@halles.fr").print);
    expect(row?.snapshot()).toMatchObject({ unsubscribedSource: "staff", unsubscribedAt: NOW });
  });

  it("se désinscrire d'un espace n'éteint pas l'autre", async () => {
    const w = marketingWorld();
    await w.consent.unsubscribe("lfc", "colette@halles.fr", "staff");
    expect(await w.consent.preferenceOf("lfd", "colette@halles.fr")).toBeNull();
  });
});
