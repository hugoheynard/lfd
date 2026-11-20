import type { CatalogViewer } from "../../domain/catalog-viewer.js";
import { ArticleNotServedToPublicError } from "../../domain/errors/not-served-to-public.error.js";
import { ReservedArticleRefusedError } from "../../domain/errors/reserved-article-refused.error.js";
import { ArticleNotServedToCompanyError } from "../../domain/errors/not-served-to-company.error.js";
import type { CatalogItem } from "../../domain/ports/product-catalog.reader.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../infrastructure/in-memory-product-catalog.js";
import { InMemoryReservationHolders } from "../../infrastructure/in-memory-reservation-holders.js";
import { ReservedArticleGuard } from "../reserved-article-guard.service.js";
import { ArticleOffMenuError } from "../../domain/errors/article-off-menu.error.js";
import { menuMarkOf } from "../../domain/sub-account-menu-verdict.js";
import type { MenuReading } from "../../../shared/company-standing/domain/sub-account-menu-reading.js";

/**
 * Un catalogue qui juge comme le vrai lecteur, pour deux articles réservés à
 * `co_a` : l'un `visible_locked`, l'autre `hidden`. Le personnel les voit
 * étiquetés ; le pro B voit le premier verrouillé, pas le second.
 */
class ReservedToA extends ProductCatalogReader {
  readonly viewers: CatalogViewer["kind"][] = [];
  private readonly items = new InMemoryProductCatalog([
    {
      sku: "OPEN",
      name: "Croissant",
      unitPriceMillicents: 1,
      vatRate: 5.5,
      family: null,
      allergens: null,
      orderTimeLimit: null,
    },
    {
      sku: "LOCKED",
      name: "Brioche",
      unitPriceMillicents: 1,
      vatRate: 5.5,
      family: null,
      allergens: null,
      orderTimeLimit: null,
    },
    {
      sku: "HIDDEN",
      name: "Pain",
      unitPriceMillicents: 1,
      vatRate: 5.5,
      family: null,
      allergens: null,
      orderTimeLimit: null,
    },
  ]);

  resolve(): Promise<CatalogItem | null> {
    return Promise.resolve(null);
  }

  all(): Promise<readonly CatalogItem[]> {
    return Promise.resolve([]);
  }

  async resolveMany(
    skus: readonly string[],
    viewer: CatalogViewer,
  ): Promise<ReadonlyMap<string, CatalogItem>> {
    this.viewers.push(viewer.kind);
    const regarding = viewer.kind === "staff" ? viewer.regarding?.companyId : undefined;
    const reader = viewer.kind === "pro" ? viewer.holders.companyId : regarding;
    const isA = reader === "co_a";
    if (viewer.kind === "public") {
      // Le rayon des particuliers ne sert que l'article ouvert.
      return new Map([...(await this.items.resolveMany(skus))].filter(([sku]) => sku === "OPEN"));
    }
    const found = new Map<string, CatalogItem>();
    for (const [sku, item] of await this.items.resolveMany(skus)) {
      if (sku === "OPEN" || isA) {
        found.set(sku, { ...item, reservation: sku === "OPEN" ? "none" : "mine" });
      } else if (viewer.kind === "staff" || sku === "LOCKED") {
        found.set(sku, { ...item, reservation: "other" });
      }
    }
    return found;
  }
}

function guard(catalog = new ReservedToA()) {
  return new ReservedArticleGuard(catalog, new InMemoryReservationHolders());
}

describe("ReservedArticleGuard — le mur des abonnements", () => {
  it("laisse passer ce qui est ouvert, et ce qui est réservé au compte", async () => {
    await expect(guard().ensureOpenTo("co_b", ["OPEN"])).resolves.toBeUndefined();
    await expect(guard().ensureOpenTo("co_a", ["LOCKED", "HIDDEN"])).resolves.toBeUndefined();
  });

  it("refuse par son nom un article réservé ailleurs, visible non commandable", async () => {
    const refusal = guard().ensureOpenTo("co_b", ["OPEN", "LOCKED"]);
    await expect(refusal).rejects.toThrow(ReservedArticleRefusedError);
    await expect(refusal).rejects.toMatchObject({ sku: "LOCKED" });
  });

  it("refuse sans dire pourquoi un article réservé ailleurs et invisible : le nommer dirait qu'il existe", async () => {
    await expect(guard().ensureOpenTo("co_b", ["HIDDEN"])).rejects.toThrow(
      ArticleNotServedToCompanyError,
    );
  });

  /** Décision de Hugo (2026-10-30) : un abonnement pro passe le mur complet du rayon pro. */
  it("refuse à un pro un article que son rayon ne sert pas, ou inconnu, par le lecteur pro", async () => {
    const catalog = new ReservedToA();
    const refusal = guard(catalog).ensureOpenTo("co_b", ["OPEN", "NOPE"]);
    await expect(refusal).rejects.toThrow(ArticleNotServedToCompanyError);
    await expect(refusal).rejects.toMatchObject({ sku: "NOPE" });
    expect(catalog.viewers).toEqual(["pro"]);
  });

  it("ne lit rien pour une liste vide", async () => {
    const catalog = new ReservedToA();
    await guard(catalog).ensureOpenTo(null, []);
    await guard(catalog).ensureOpenTo("co_b", []);
    expect(catalog.viewers).toEqual([]);
  });

  /**
   * Régression : un particulier (société `null`) ne passait aucun mur, et
   * s'abonnait à un article pro, réservé ou sur mesure (relevé le 2026-10-30).
   */
  it("refuse à un particulier ce que son rayon ne sert pas, par le lecteur public", async () => {
    const catalog = new ReservedToA();
    const refusal = guard(catalog).ensureOpenTo(null, ["OPEN", "LOCKED"]);
    await expect(refusal).rejects.toThrow(ArticleNotServedToPublicError);
    await expect(refusal).rejects.toMatchObject({ sku: "LOCKED" });
    expect(catalog.viewers).toEqual(["public"]);
  });

  it("laisse un particulier s'abonner à ce que son rayon sert", async () => {
    await expect(guard().ensureOpenTo(null, ["OPEN", "OPEN"])).resolves.toBeUndefined();
  });
});

/**
 * Un catalogue qui juge la carte comme le vrai lecteur : il lit la carte que
 * le lecteur porte, sur les seuls SKU (aucune famille ici).
 */
class MenuJudging extends ReservedToA {
  readonly menus: (MenuReading | null)[] = [];

  override async resolveMany(
    skus: readonly string[],
    viewer: CatalogViewer,
  ): Promise<ReadonlyMap<string, CatalogItem>> {
    const menu = viewer.kind === "pro" ? viewer.menu : null;
    this.menus.push(menu);
    const found = new Map<string, CatalogItem>();
    for (const [sku, item] of await super.resolveMany(skus, viewer)) {
      const mark = menuMarkOf(menu, { sku, productSku: sku, familyPath: [] });
      found.set(sku, { ...item, menu: mark });
    }
    return found;
  }
}

/** La carte du site à l'abonnement (`plan-carte-des-sites.md`, § 3.5, § 3.7). */
describe("ReservedArticleGuard — la carte du site", () => {
  // Le site lit comme `co_a` : LOCKED lui est réservé, seule la carte le ferme.
  const SITE = "co_a";
  const ONLY_OPEN: MenuReading = {
    mode: "only",
    offMenu: "visible_locked",
    entries: [{ level: "sku", ref: "OPEN", effect: "include" }],
  };
  const siteGuard = (catalog: MenuJudging) =>
    new ReservedArticleGuard(
      catalog,
      new InMemoryReservationHolders(
        new Map([[SITE, "co_principal"]]),
        new Map([[SITE, ONLY_OPEN]]),
      ),
    );

  it("refuse par son nom un article hors de la carte, avec la carte lue avec les porteurs", async () => {
    const catalog = new MenuJudging();
    const refusal = siteGuard(catalog).ensureOpenTo(SITE, ["OPEN", "LOCKED"]);
    await expect(refusal).rejects.toThrow(ArticleOffMenuError);
    await expect(refusal).rejects.toMatchObject({ sku: "LOCKED" });
    expect(catalog.menus).toEqual([ONLY_OPEN]);
  });

  it("laisse passer ce que la carte ouvre", async () => {
    await expect(
      siteGuard(new MenuJudging()).ensureOpenTo(SITE, ["OPEN"]),
    ).resolves.toBeUndefined();
  });
});
