import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import { PrismaCatalogReader } from "../../prisma-catalog.reader.js";
import { SnapshotCatalogReader } from "../snapshot-catalog.reader.js";
import {
  PUBLIC_VIEWER,
  proViewer,
  staffViewer,
  type CatalogViewer,
} from "../../../domain/catalog-viewer.js";
import { article, inQuote, snapshotModule } from "./snapshot-doubles.js";

async function setup(options: { readonly memory?: boolean } = {}) {
  const built = await snapshotModule([SnapshotCatalogReader, PrismaCatalogReader], options);
  return { ...built, reader: built.moduleRef.get(SnapshotCatalogReader) };
}

const PRO_A: CatalogViewer = proViewer({ companyId: "co-a", activePrincipalId: null });
const PRO_B: CatalogViewer = proViewer({ companyId: "co-b", activePrincipalId: null });

describe("SnapshotCatalogReader — la source", () => {
  it("hors de la portée de l'instantané (la passation), il lit la base comme avant", async () => {
    const { base, reader } = await setup();
    await runWithRequestContext({ now: new Date(0), traceId: "passation" }, () =>
      reader.listByShopSkus(["A-1"], PRO_A),
    );
    expect(base.calls).toEqual(["base:articles"]);
  });

  it("réglage `off` : la base à chaque requête, même dans le devis", async () => {
    const { base, reader } = await setup({ memory: false });
    await inQuote(() => reader.listByShopSkus(["A-1"], PRO_A));
    await inQuote(() => reader.listByShopSkus(["A-1"], PRO_A));
    expect(base.calls).toEqual(["base:articles", "base:articles"]);
  });

  it("🔴 les réservations de l'appelant AVANT les numéros (§ 9)", async () => {
    const { base, reader } = await setup();
    base.articles = [article("A-1")];
    await inQuote(() => reader.listByShopSkus(["A-1"], PRO_A));
    expect(base.calls).toEqual(["reservations:co-a", "versions", "articles"]);
  });

  it("à chaud, un devis pro ne lit que ses réservations et les numéros", async () => {
    const { base, reader } = await setup();
    base.articles = [article("A-1")];
    await inQuote(() => reader.listByShopSkus(["A-1"], PRO_A));
    base.calls.length = 0;
    await inQuote(() => reader.listByShopSkus(["A-1"], PRO_A));
    expect(base.calls).toEqual(["reservations:co-a", "versions"]);
  });
});

describe("SnapshotCatalogReader — le mur des réservations", () => {
  const reservedToA = article("R-1", { _count: { reservations: 1 } });

  it("un pro ne voit pas l'article réservé à une autre société", async () => {
    const { base, reader } = await setup();
    base.articles = [reservedToA];
    base.reservations = [{ sku: "R-1", companyId: "co-a" }];
    const seen = await inQuote(() => reader.listByShopSkus(["R-1"], PRO_B));
    expect(seen.has("R-1")).toBe(false);
  });

  it("la société à qui il est réservé le voit, marqué « mine »", async () => {
    const { base, reader } = await setup();
    base.articles = [reservedToA];
    base.reservations = [{ sku: "R-1", companyId: "co-a" }];
    const seen = await inQuote(() => reader.findByShopSku("R-1", PRO_A));
    expect(seen?.reservation).toBe("mine");
  });

  it("le public ne voit jamais un article réservé", async () => {
    const { base, reader } = await setup();
    base.articles = [reservedToA];
    await expect(inQuote(() => reader.listSellable(PUBLIC_VIEWER))).resolves.toEqual([]);
  });
});

describe("SnapshotCatalogReader — ce que chaque lecture réapplique", () => {
  it("la lecture A écarte l'article sans taux, et garde l'ordre à trois clés", async () => {
    const { base, reader } = await setup();
    // La base rend l'ordre à trois clés (`SHELF_ORDER`) ; la vue le garde.
    base.articles = [
      article("A-1", { position: 1 }),
      article("SANS-TAUX", { vatRatePercent: null }),
      article("B-1", { position: 2 }),
    ];
    const sellable = await inQuote(() => reader.listSellable(staffViewer("pro")));
    expect(sellable.map((item) => item.sku)).toEqual(["A-1", "B-1"]);
  });

  it("un article sans taux reste absent du public, comme du rayon", async () => {
    const { base, reader } = await setup();
    base.articles = [article("SANS-TAUX", { vatRatePercent: null })];
    await expect(inQuote(() => reader.listSellable(PUBLIC_VIEWER))).resolves.toEqual([]);
  });

  it("une déclinaison non défaut ne se vend que si sa fiche est en vignettes", async () => {
    const { base, reader } = await setup();
    base.articles = [
      article("V-2", { isDefault: false }),
      article("T-2", { isDefault: false, variantsAsTiles: true }),
    ];
    const found = await inQuote(() => reader.listByShopSkus(["V-2", "T-2"], PRO_A));
    expect([...found.keys()]).toEqual(["T-2"]);
  });

  it("un SKU inconnu de l'instantané (retiré, jamais reçu) est absent", async () => {
    const { reader } = await setup();
    await expect(inQuote(() => reader.findByShopSku("RETIRE", PRO_A))).resolves.toBeNull();
  });

  it("le public lit l'étiquette, le pro son prix", async () => {
    const { base, reader } = await setup();
    base.articles = [article("A-1")];
    const pro = await inQuote(() => reader.findByShopSku("A-1", PRO_A));
    const shown = await inQuote(() => reader.findByShopSku("A-1", PUBLIC_VIEWER));
    expect(pro?.unitPriceMillicents).toBe(100_000);
    expect(shown?.unitPriceMillicents).toBe(120_000);
  });
});
