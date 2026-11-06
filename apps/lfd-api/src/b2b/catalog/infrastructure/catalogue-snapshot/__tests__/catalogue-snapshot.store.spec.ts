import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import { withCatalogueSnapshot } from "../../../application/catalogue-snapshot-scope.js";
import { article, inQuote, operation, snapshotModule } from "./snapshot-doubles.js";

/**
 * La mémoire de l'instantané (plan des matériaux du catalogue, § 2.3) : quand
 * elle sert, ce qu'une requête lit une fois, ce qui se garde d'une requête à
 * l'autre, et le mur des réservations.
 */
describe("CatalogueSnapshotStore — quand l'instantané sert", () => {
  it("dans une requête, dans la portée, réglage `on` : il sert", async () => {
    const { store } = await snapshotModule([]);
    await expect(inQuote(() => Promise.resolve(store.serves()))).resolves.toBe(true);
  });

  it("hors requête (cron, semis) : il ne sert pas, rien n'est gardé", async () => {
    const { store } = await snapshotModule([]);
    await expect(withCatalogueSnapshot(() => Promise.resolve(store.serves()))).resolves.toBe(false);
  });

  it("hors de la portée (la passation, l'administration) : il ne sert pas", async () => {
    const { store } = await snapshotModule([]);
    const served = runWithRequestContext({ now: new Date(0), traceId: "passation" }, () =>
      store.serves(),
    );
    expect(served).toBe(false);
  });

  it("réglage `off` (l'arrêt d'urgence) : il ne sert pas", async () => {
    const { store } = await snapshotModule([], { memory: false });
    await expect(inQuote(() => Promise.resolve(store.serves()))).resolves.toBe(false);
  });
});

describe("CatalogueSnapshotStore — les numéros et les morceaux", () => {
  it("les numéros se lisent UNE fois par requête, quel que soit le nombre de questions", async () => {
    const { base, store } = await snapshotModule([]);
    base.articles = [article("A-1")];
    await inQuote(async () => {
      await store.articles();
      await store.generalCutoff();
      await store.articles();
    });
    expect(base.calls).toEqual(["versions", "articles", "cutoff"]);
  });

  it("à la requête suivante, numéros inchangés : seule l'estampille est relue", async () => {
    const { base, store } = await snapshotModule([]);
    base.articles = [article("A-1")];
    await inQuote(() => store.articles());
    await inQuote(() => store.articles());
    expect(base.calls).toEqual(["versions", "articles", "versions"]);
  });

  it("seul le morceau dont le numéro bouge est relu", async () => {
    const { base, store } = await snapshotModule([]);
    base.articles = [article("A-1")];
    await inQuote(() => Promise.all([store.articles(), store.generalCutoff()]));
    base.versions.set("order_cutoffs", 2n);
    base.calls.length = 0;
    await inQuote(() => Promise.all([store.articles(), store.generalCutoff()]));
    expect(base.calls).toEqual(["versions", "cutoff"]);
  });

  it("un article modifié (numéro monté) est servi dès la requête suivante", async () => {
    const { base, store } = await snapshotModule([]);
    base.articles = [article("A-1", { priceMillicents: 100_000 })];
    await inQuote(() => store.articles());
    base.articles = [article("A-1", { priceMillicents: 90_000 })];
    base.versions.set("catalog", 2n);
    const after = await inQuote(() => store.articles());
    expect(after.bySku.get("A-1")?.priceMillicents).toBe(90_000);
  });

  it("ligne absente de context_versions : le morceau est relu à chaque demande", async () => {
    const { base, store } = await snapshotModule([]);
    base.versions.delete("catalog");
    await inQuote(() => store.articles());
    await inQuote(() => store.articles());
    expect(base.calls.filter((call) => call === "articles")).toHaveLength(2);
  });

  it("forget() : le même numéro relit le morceau (la remise du harnais)", async () => {
    const { base, store } = await snapshotModule([]);
    await inQuote(() => store.articles());
    store.forget();
    await inQuote(() => store.articles());
    expect(base.calls.filter((call) => call === "articles")).toHaveLength(2);
  });

  /**
   * Régression (§ 12, lot M2) : l'instantané triait le SKU en unités de code,
   * Postgres selon sa collation — deux SKU qui ne diffèrent que par la
   * ponctuation pouvaient s'ordonner autrement au rayon. L'ordre est désormais
   * demandé à la base, et gardé tel qu'elle le rend.
   */
  it("demande l'ordre à trois clés à Postgres, et le garde tel quel", async () => {
    const { base, store } = await snapshotModule([]);
    base.articles = [article("B-1"), article("B.1"), article("B_1")];
    const snapshot = await inQuote(() => store.articles());
    expect(base.lastArticleRead?.orderBy).toEqual([
      { category: { position: "asc" } },
      { position: "asc" },
      { sku: "asc" },
    ]);
    expect(snapshot.rows.map((row) => row.sku)).toEqual(["B-1", "B.1", "B_1"]);
  });

  it("le morceau des opérations se garde sous SON numéro, sans relire les articles", async () => {
    const { base, store } = await snapshotModule([]);
    base.operations = [operation("noel")];
    await inQuote(() => Promise.all([store.articles(), store.operations()]));
    base.versions.set("operations", 2n);
    base.calls.length = 0;
    const second = await inQuote(() => Promise.all([store.articles(), store.operations()]));
    expect(base.calls).toEqual(["versions", "operations"]);
    expect(second[1].rows.map((row) => row.key)).toEqual(["noel"]);
  });

  it("oublie aussi le morceau des opérations", async () => {
    const { base, store } = await snapshotModule([]);
    await inQuote(() => store.operations());
    store.forget();
    await inQuote(() => store.operations());
    expect(base.calls.filter((call) => call === "operations")).toHaveLength(2);
  });
});

describe("CatalogueSnapshotStore — les réservations de l'appelant", () => {
  it("aucune lecture pour un lecteur sans société", async () => {
    const { base, store } = await snapshotModule([]);
    await inQuote(() => store.reservationsFor([]));
    expect(base.calls).toEqual([]);
  });

  it("lues une fois par requête et par jeu de sociétés", async () => {
    const { base, store } = await snapshotModule([]);
    await inQuote(async () => {
      await store.reservationsFor(["co-a", "pr-a"]);
      await store.reservationsFor(["pr-a", "co-a"]);
    });
    await inQuote(() => store.reservationsFor(["co-a", "pr-a"]));
    expect(base.calls).toEqual(["reservations:co-a+pr-a", "reservations:co-a+pr-a"]);
  });

  it("le mur dans la requête : seules les réservations des sociétés de l'appelant reviennent", async () => {
    const { base, store } = await snapshotModule([]);
    base.reservations = [
      { sku: "A-1", companyId: "co-a" },
      { sku: "B-1", companyId: "co-b" },
    ];
    const mine = await inQuote(() => store.reservationsFor(["co-a"]));
    expect([...mine.keys()]).toEqual(["A-1"]);
  });
});
