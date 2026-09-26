import type { CatalogAdminItemView, CatalogItemView } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";
/**
 * E2E du **paramétrage du catalogue** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : les refus de l'agrégat traversent le bus et le
 * filtre d'erreurs pour ressortir en 400/409, et une décision posée survit
 * réellement à l'ingestion suivante. Deux propriétés qu'un test unitaire montre
 * séparément et jamais ensemble.
 */
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Prisma } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await push(200);
});

const SKU = "VIE-001-1";

/** Ce qu'une déclinaison porte de réglementaire sur le fil. */
interface SheetOnWire {
  readonly allergens: string[] | null;
  readonly allergenLabels: {
    labels: { category: string; label: string }[];
    incomplete: boolean;
  } | null;
}

const NO_SHEET: SheetOnWire = { allergens: null, allergenLabels: null };

function snapshot(priceMillicents: number, sheet: SheetOnWire = NO_SHEET): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [
      {
        id: "fam-vien",
        name: "Viennoiseries",
        slug: "viennoiseries",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
    ],
    products: [
      {
        id: "prd_1",
        sku: "VIE-001",
        name: "Croissant",
        categoryId: "fam-vien",
        kind: "daily",
        variants: [
          {
            ...sheet,
            id: "var_1",
            sku: SKU,
            name: "Croissant",
            priceMillicents,
            weightGrams: null,
            isDefault: true,
            position: 0,
            vatRatePercent: 5.5,
            publicTtcCents: 250,
            publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
          },
        ],
        note: null,
        image: null,
        thumbnail: null,
        operationOnly: false,
      },
    ],
    orderTimeLimits: [],
    operations: [],
  };
}

/**
 * L'ingestion telle que le référentiel la déclenche : par le port, pas par HTTP.
 *
 * Le prix se donne en **centimes** — un tarif s'écrit comme on le prononce — et
 * part sur le fil en millicentimes, l'unité des prix unitaires.
 */
function push(cents: number, sheet: SheetOnWire = NO_SHEET) {
  return ctx.app.get(B2bCatalogDriver).send(snapshot(millicentsFromCents(cents), sheet), {
    revisionId: "rev_e2e",
    fingerprint: "empreinte-e2e",
  });
}

/** Le staff appelle avec un jeton quelconque : le verifier est doublé. */
function asStaff() {
  return ctx.http().set("Authorization", "Bearer staff");
}

/**
 * Le premier article de la liste d'administration, **typé par le contrat**.
 *
 * 🔴 Il l'était par une forme recopiée à la main, derrière un
 * `as unknown as` — donc par un sous-ensemble arbitraire des champs, qui se
 * périmait en silence à chaque champ ajouté. Le 2026-09-21, le prix public
 * décidé y a été lu sans que la forme le connaisse : le test passait à
 * l'exécution et la porte `lint:spec-types` l'a refusé, ce qui est exactement
 * son rôle.
 *
 * Lire `CatalogAdminItemView` coûte le même effort et fait l'inverse : un champ
 * renommé au contrat casse ici, au lieu de laisser le doublé dériver de ce
 * qu'il prétend jouer.
 */
async function listOne(): Promise<CatalogAdminItemView | undefined> {
  const response = await asStaff().get("/admin/catalog");
  const [item] = jsonBody<CatalogAdminItemView[]>(response);
  return item;
}

describe("GET /admin/catalog", () => {
  it("rend les DEUX prix, pas seulement le résultat", async () => {
    const item = await listOne();

    expect(item?.pimPriceMillicents).toBe(200_000);
    expect(item?.b2bPriceMillicents).toBeNull();
    expect(item?.effectivePriceMillicents).toBe(200_000);
  });

  /**
   * 🔴 **L'écran voit ce que la caisse voit — y compris l'absence.**
   *
   * Cette vue repliait sur le taux de la FAMILLE quand l'article n'en portait
   * pas, exactement comme le lecteur de vente. Les deux s'accordaient donc, sur
   * un taux que personne n'avait posé sur cet article, et le compteur « des
   * articles ne sont pas vendables » de l'écran de catalogue restait à zéro
   * pendant que la boutique facturait ce taux emprunté.
   *
   * Les deux replis sont partis ensemble le 2026-09-06, et il fallait qu'ils
   * partent ensemble : en retirer un seul aurait rouvert la divergence dans un
   * sens ou dans l'autre. Ce test tient la moitié « écran » ;
   * `shop-catalogue.e2e-spec.ts` tient la moitié « caisse ».
   *
   * La famille EST réglée à 5,5 % dans ce jeu d'essai : c'est le cas que le
   * repli couvrait.
   */
  it("rend un taux NUL quand l'article n'en porte pas, même si sa famille en a un", async () => {
    await ctx.app.get(B2bCatalogDriver).send(
      {
        ...snapshot(200_000, NO_SHEET),
        products: snapshot(200_000, NO_SHEET).products.map((product) => ({
          ...product,
          variants: product.variants.map((variant) => ({ ...variant, vatRatePercent: null })),
        })),
      },
      { revisionId: "rev_sans_taux", fingerprint: "empreinte-sans-taux" },
    );

    const item = await listOne();

    expect(item?.vatRatePercent).toBeNull();
  });

  it("refuse un appel sans jeton staff", async () => {
    const response = await ctx.http().get("/admin/catalog");

    expect(response.status).toBe(401);
  });
});

/**
 * **La fiche réglementaire, du fil jusqu'à l'écran.**
 *
 * Ce chemin n'était traversé par aucun e2e : la fixture ne poussait que
 * `allergens: null`, donc le seul état qui ne dit rien. Sur une surface en
 * service depuis le 2026-08-17, et un champ dont une erreur est un défaut de
 * conformité, c'était le trou le plus cher du fichier.
 *
 * Ce que seul ce niveau prouve : les mentions traversent réellement le `jsonb`
 * de `catalog_items.allergen_labels` — l'aller-retour de sérialisation compris —
 * et ressortent identiques à ce que le référentiel a projeté.
 */
describe("GET /admin/catalog — la fiche d'allergènes", () => {
  const GLUTEN = { category: "gluten", label: "Céréales contenant du gluten" };

  /** Ce que la lecture rend du champ réglementaire, quel que soit le reste. */
  async function sheetOf(): Promise<{
    allergens: { category: string; label: string }[] | null;
    allergensIncomplete: boolean;
  }> {
    const response = await asStaff().get("/admin/catalog");
    const [item] = jsonBody<unknown[]>(response) as {
      allergens: { category: string; label: string }[] | null;
      allergensIncomplete: boolean;
    }[];
    return {
      allergens: item?.allergens ?? null,
      allergensIncomplete: item?.allergensIncomplete === true,
    };
  }

  it("distingue « aucune fiche » de « fiche sans allergène »", async () => {
    expect(await sheetOf()).toEqual({ allergens: null, allergensIncomplete: false });

    await ctx.reset();
    await push(200, { allergens: [], allergenLabels: { labels: [], incomplete: false } });

    expect(await sheetOf()).toEqual({ allergens: [], allergensIncomplete: false });
  });

  /**
   * **La preuve que l'écran SUBIT les mentions au lieu de les recalculer.**
   *
   * Le libellé poussé ici n'est pas celui que la table figée de
   * `allergen-mapping.ts` produit pour `UW` : si l'écran le rend tel quel, c'est
   * qu'il ne repasse plus par elle. C'était le cas jusqu'au 2026-09-03, avec
   * pour conséquence deux sources de vérité pour une même affirmation
   * réglementaire — le référentiel administrable côté boutique, une table gelée
   * côté back-office.
   */
  it("rend le libellé du RÉFÉRENTIEL, pas celui d'une table figée", async () => {
    const fromReferential = { category: "gluten", label: "Gluten (libellé du référentiel)" };
    await ctx.reset();
    await push(200, {
      allergens: ["UW"],
      allergenLabels: { labels: [fromReferential], incomplete: false },
    });

    expect(await sheetOf()).toEqual({
      allergens: [fromReferential],
      allergensIncomplete: false,
    });
  });

  it("reporte l'aveu d'amputation que le référentiel a émis", async () => {
    await ctx.reset();
    await push(200, {
      allergens: ["UW", "SO"],
      allergenLabels: { labels: [GLUTEN], incomplete: true },
    });

    expect(await sheetOf()).toEqual({ allergens: [GLUTEN], allergensIncomplete: true });
  });

  /**
   * **L'article reçu avant la v5 du fil** : des codes, pas de mentions. L'écran
   * ne doit jamais en conclure « sans allergène » — la liste vide n'est lisible
   * qu'accompagnée du drapeau, et le gabarit garde sa branche derrière lui.
   */
  it("n'affirme jamais « sans allergène » sur des codes sans mentions", async () => {
    await ctx.reset();
    await push(200, { allergens: ["UW"], allergenLabels: null });

    expect(await sheetOf()).toEqual({ allergens: [], allergensIncomplete: true });
  });
});

describe("PUT /admin/catalog/:sku/price", () => {
  it("pose le prix B2B et trace son auteur", async () => {
    await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 180_000 })
      .expect(204);

    const item = await listOne();
    expect(item?.b2bPriceMillicents).toBe(180_000);
    expect(item?.effectivePriceMillicents).toBe(180_000);
    // L'id de fiche, plus le `sub` (plan de l'auteur, étape 3).
    expect(item?.decidedBy).toBe(E2E_STAFF_ID);
  });

  it("refuse un prix nul — le refus de l'agrégat ressort en 400", async () => {
    const response = await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 0 });

    expect(response.status).toBe(400);
  });

  /**
   * Recopier le prix du PIM créerait une négociation fantôme qui bloquerait sa
   * prochaine hausse. Le refus est **métier**, donc 409, et il nomme le geste
   * correct.
   */
  it("refuse un prix identique à celui du PIM", async () => {
    const response = await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 200_000 });

    expect(response.status).toBe(409);
  });

  it("rend 404 pour un article qui n'est plus au catalogue", async () => {
    const response = await asStaff()
      .put("/admin/catalog/INCONNU/price")
      .send({ priceMillicents: 180_000 });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /admin/catalog/:sku/price", () => {
  it("ramène l'article au tarif du PIM", async () => {
    await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 180_000 })
      .expect(204);

    await asStaff().delete(`/admin/catalog/${SKU}/price`).expect(204);

    const item = await listOne();
    expect(item?.b2bPriceMillicents).toBeNull();
    expect(item?.effectivePriceMillicents).toBe(200_000);
  });
});

/**
 * **Le prix PUBLIC**, et ce qui le distingue de son voisin professionnel.
 *
 * Ces cas traversent le vrai SQL parce que c'est là que se joue le piège du
 * lot : l'objet d'écriture de `saveMany` est le seul endroit du dépôt où un
 * champ oublié COMPILE et perd la donnée. Un test de handler l'aurait raté.
 */
describe("PUT /admin/catalog/:sku/public-price", () => {
  it("pose l'étiquette publique, en centimes TTC, sans toucher au prix pro", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/public-price`).send({ ttcCents: 299 }).expect(204);

    const item = await listOne();
    expect(item?.decidedPublicTtcCents).toBe(299);
    // 🔴 Le canal professionnel n'a pas bougé : deux audiences, deux décisions.
    expect(item?.b2bPriceMillicents).toBeNull();
    expect(item?.decidedBy).toBe(E2E_STAFF_ID);
  });

  /**
   * 🔴 **Le cas qui prouve que la donnée est bien ÉCRITE**, et pas seulement
   * acceptée. Une décision réduite au seul prix public doit retenir la ligne
   * d'override : si `untouched` l'ignorait, elle serait supprimée et le prix
   * disparaîtrait — pas au geste, mais au prochain push du PIM.
   */
  it("🔴 survit à une relecture quand le prix public est la SEULE décision", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/public-price`).send({ ttcCents: 299 }).expect(204);

    // On repasse par le miroir, pas par un cache : c'est la base qu'on éprouve.
    const stored = await ctx.prisma.catalogItemOverride.findUnique({ where: { sku: SKU } });
    expect(stored?.decidedPublicTtcCents).toBe(299);
    expect(stored?.priceMillicents).toBeNull();
  });

  it("refuse un prix nul — le refus de l'agrégat ressort en 400", async () => {
    const response = await asStaff()
      .put(`/admin/catalog/${SKU}/public-price`)
      .send({ ttcCents: 0 });

    expect(response.status).toBe(400);
  });

  it("refuse l'étiquette du PIM recopiée — 409, et le geste correct est de revenir", async () => {
    const response = await asStaff()
      .put(`/admin/catalog/${SKU}/public-price`)
      .send({ ttcCents: 250 });

    expect(response.status).toBe(409);
  });

  /**
   * 🔴 **Le refus sans équivalent professionnel.** La vitrine publique écarte
   * déjà un article dont le miroir ne porte pas le contexte servi : accepter le
   * prix l'écrirait, l'afficherait comme une décision prise, et ne le servirait
   * jamais.
   */
  it("🔴 refuse un prix sur un article que la vitrine publique n'expose pas", async () => {
    await ctx.prisma.catalogItem.update({
      where: { sku: SKU },
      data: { publicByContext: Prisma.DbNull },
    });

    const response = await asStaff()
      .put(`/admin/catalog/${SKU}/public-price`)
      .send({ ttcCents: 299 });

    expect(response.status).toBe(409);
  });
});

describe("DELETE /admin/catalog/:sku/public-price", () => {
  it("ramène l'article à l'étiquette du PIM", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/public-price`).send({ ttcCents: 299 }).expect(204);

    await asStaff().delete(`/admin/catalog/${SKU}/public-price`).expect(204);

    const item = await listOne();
    expect(item?.decidedPublicTtcCents).toBeNull();
    // Plus aucune décision : la ligne d'override est retirée, pas neutralisée.
    expect(await ctx.prisma.catalogItemOverride.findUnique({ where: { sku: SKU } })).toBeNull();
  });
});

/**
 * **Le masquage par audience**, et la divergence qu'il ferme.
 *
 * 🔴 Ces cas traversent le vrai SQL parce que le filtre de visibilité vivait à
 * QUATRE endroits — le rayon, la fiche, le lot de SKU, la commande — et qu'un
 * seul rendu conscient de l'audience aurait fait diverger le rayon et la
 * caisse : un article masqué au pro se serait affiché au public et aurait
 * échoué au panier, un article masqué au public serait resté achetable. Un
 * test de handler n'aurait vu ni l'un ni l'autre.
 */
describe("masquage par audience", () => {
  it("🔴 masquer au PRO laisse l'article en vitrine publique", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);

    const item = await listOne();
    expect(item?.isHidden).toBe(true);
    expect(item?.isHiddenPublic).toBe(false);

    // La vitrine publique, servie sans jeton : elle le montre encore.
    const shop = jsonBody<{ items: { sku: string }[] }>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );
    expect(shop.items.map((entry) => entry.sku)).toContain("VIE-001");
  });

  it("🔴 masquer au PUBLIC le retire de la vitrine, sans toucher au pro", async () => {
    await asStaff()
      .put(`/admin/catalog/${SKU}/public-visibility`)
      .send({ hidden: true })
      .expect(204);

    const item = await listOne();
    expect(item?.isHiddenPublic).toBe(true);
    expect(item?.isHidden).toBe(false);

    const shop = jsonBody<{ items: { sku: string }[] }>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );
    expect(shop.items.map((entry) => entry.sku)).not.toContain("VIE-001");
  });

  /**
   * 🔴 **Le devis est le second des quatre sites.** Un article masqué au public
   * ne doit pas seulement disparaître du rayon : il doit cesser d'être
   * achetable. C'est là que la divergence se serait vue, en caisse.
   */
  it("🔴 masqué au public, il n'est plus achetable par la route publique", async () => {
    await asStaff()
      .put(`/admin/catalog/${SKU}/public-visibility`)
      .send({ hidden: true })
      .expect(204);

    const response = await ctx
      .http()
      .post("/shop/quote")
      .send({ lines: [{ sku: "VIE-001", quantity: 1 }], fulfillment: null });

    expect(response.status).toBe(400);
  });

  it("revient en vitrine publique sans rien changer au canal pro", async () => {
    await asStaff()
      .put(`/admin/catalog/${SKU}/public-visibility`)
      .send({ hidden: true })
      .expect(204);

    await asStaff()
      .put(`/admin/catalog/${SKU}/public-visibility`)
      .send({ hidden: false })
      .expect(204);

    const item = await listOne();
    expect(item?.isHiddenPublic).toBe(false);
    // Plus aucune décision : la ligne d'override est retirée, pas neutralisée.
    expect(await ctx.prisma.catalogItemOverride.findUnique({ where: { sku: SKU } })).toBeNull();
  });
});

describe("visibilité et mise en avant", () => {
  it("masque puis réaffiche", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);
    expect((await listOne())?.isHidden).toBe(true);

    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: false }).expect(204);
    expect((await listOne())?.isHidden).toBe(false);
  });

  it("refuse de mettre en avant un article masqué", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);

    const response = await asStaff().put(`/admin/catalog/${SKU}/featured`).send({ featured: true });

    expect(response.status).toBe(409);
  });

  it("masquer éteint la mise en avant", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/featured`).send({ featured: true }).expect(204);

    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);

    expect((await listOne())?.isFeatured).toBe(false);
  });
});

/**
 * La propriété qui justifie tout le montage à deux tables. Elle se vérifie ici
 * de bout en bout : décision posée par HTTP, push réel, décision toujours là.
 */
describe("une décision survit au push suivant", () => {
  it("garde le prix B2B quand le PIM change le sien", async () => {
    await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 180_000 })
      .expect(204);

    await push(220);

    const item = await listOne();
    expect(item?.pimPriceMillicents).toBe(220_000);
    expect(item?.b2bPriceMillicents).toBe(180_000);
    expect(item?.effectivePriceMillicents).toBe(180_000);
  });
});

/**
 * **L'historique du tarif canonique** — ce que la frise attendait pour dire le
 * vrai prix.
 *
 * Jusqu'ici, une lecture datée appliquait les décisions d'hier aux tarifs
 * d'AUJOURD'HUI : un mélange qui ressemble à un prix passé sans en être un.
 * Éprouvé de bout en bout parce que la garantie est transactionnelle — la trace
 * est écrite dans la transaction qui sauve l'article, et seule une vraie base le
 * démontre.
 */
describe("l'historique du tarif canonique", () => {
  it("trace le prix décidé, et le relit à la date où il valait", async () => {
    const before = new Date();
    await new Promise((resolve) => setTimeout(resolve, 20));

    await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 999_000 })
      .expect(204);

    const now = jsonBody<{
      categories: { items: { sku: string; canonicalMillicents: number }[] }[];
    }>(await asStaff().get("/admin/pricing").expect(200));
    expect(croissantIn(now)).toBe(millicentsFromCents(999));

    // La MÊME lecture, datée d'avant la décision : le tarif d'alors.
    const past = jsonBody<{
      categories: { items: { sku: string; canonicalMillicents: number }[] }[];
    }>(await asStaff().get(`/admin/pricing?at=${before.toISOString()}`).expect(200));
    expect(croissantIn(past)).toBe(millicentsFromCents(200));
  });

  /**
   * **Le chemin du PIM trace aussi.** C'est ce que le point d'écriture unique
   * garantit : l'ingestion et la décision du back-office aboutissent toutes deux
   * à `saveMany`, et aucune ne peut l'esquiver. Le `beforeEach` de cette suite
   * pousse un snapshot — il suffit donc de constater qu'une trace existe déjà.
   */
  it("trace aussi ce que le PIM pousse, sans que personne l'ait demandé", async () => {
    const rows = await ctx.prisma.catalogPriceHistory.findMany({ where: { sku: SKU } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.priceMillicents).toBe(200_000);
    expect(rows[0]?.source).toBe("pim");
  });

  /**
   * L'histoire commence quand on l'écrit, et l'écran doit pouvoir le dire : une
   * lecture antérieure applique les décisions d'alors aux tarifs d'aujourd'hui.
   */
  it("annonce depuis quand il sait quelque chose", async () => {
    const board = jsonBody<{ canonicalHistoryStartsAt: string | null }>(
      await asStaff().get("/admin/pricing").expect(200),
    );
    const first = await ctx.prisma.catalogPriceHistory.findFirst({
      orderBy: { recordedAt: "asc" },
    });

    expect(board.canonicalHistoryStartsAt).toBe(first?.recordedAt.toISOString());
  });

  /** Sans cette garde, un push de 92 articles inchangés écrirait 92 lignes. */
  it("n'écrit rien quand le prix ne bouge pas", async () => {
    const before = await ctx.prisma.catalogPriceHistory.count({ where: { sku: SKU } });

    await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 300_000 })
      .expect(204);
    await asStaff()
      .put(`/admin/catalog/${SKU}/price`)
      .send({ priceMillicents: 300_000 })
      .expect(204);

    const after = await ctx.prisma.catalogPriceHistory.count({ where: { sku: SKU } });
    expect(after - before).toBe(1);
  });
});

/** Le croissant dans un tableau de tarification, par le SKU que la boutique vend. */
function croissantIn(board: {
  categories: { items: { sku: string; canonicalMillicents: number }[] }[];
}): number | undefined {
  return board.categories
    .flatMap((category) => category.items)
    .find((item) => item.sku === "VIE-001")?.canonicalMillicents;
}

describe("GET /admin/catalog — l'ordre du rayon", () => {
  /**
   * Régression : le tri était `famille.position` puis `article.position`, et le
   * référentiel envoie `position: 0` sur **tous** les articles. Les deux
   * critères étaient donc à égalité sur tout un rayon, et Postgres rendait
   * l'ordre du tas — celui qui change dès qu'une ligne est réécrite. Poser un
   * prix faisait sauter de place l'article qu'on venait d'éditer, sur l'écran de
   * catalogue comme dans la vitrine (fix 2026-09-10).
   *
   * Le SKU départage. Le semis les déclare à l'ENVERS de l'ordre attendu : sans
   * le départage, la seule façon d'obtenir cet ordre serait la chance.
   */
  it("départage par SKU les articles de même position", async () => {
    await ctx.app.get(B2bCatalogDriver).send(
      {
        version: CATALOG_SNAPSHOT_VERSION,
        generatedAt: "2026-08-17T08:00:00.000Z",
        categories: [
          {
            id: "fam-vien",
            name: "Viennoiseries",
            slug: "viennoiseries",
            parentId: null,
            position: 0,
            vatRatePercent: 5.5,
          },
        ],
        products: ["VIE-003", "VIE-001", "VIE-002"].map((sku, index) => ({
          id: `prd_${sku}`,
          sku,
          name: sku,
          categoryId: "fam-vien",
          kind: "daily",
          variants: [
            {
              ...NO_SHEET,
              id: `var_${sku}`,
              sku: `${sku}-1`,
              name: sku,
              priceMillicents: millicentsFromCents(200 + index),
              publicTtcCents: 250,
              publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
              weightGrams: null,
              isDefault: true,
              // Le point du test : tous à la MÊME position, comme en vrai.
              position: 0,
              vatRatePercent: 5.5,
            },
          ],
          note: null,
          image: null,
          thumbnail: null,
          operationOnly: false,
        })),
        orderTimeLimits: [],
        operations: [],
      },
      { revisionId: "rev_ordre", fingerprint: "empreinte-ordre" },
    );

    const response = await asStaff().get("/admin/catalog");
    const items = jsonBody<{ sku: string }[]>(response);

    expect(items.map((item) => item.sku)).toEqual(["VIE-001-1", "VIE-002-1", "VIE-003-1"]);
  });
});

/**
 * L'**export**, éprouvé bout en bout.
 *
 * Ce que rien d'autre ne prouve : que le serveur pose bien les deux en-têtes
 * qu'un navigateur lit, que le BOM traverse la sérialisation HTTP (un
 * `res.json()` l'aurait mangé), et que le fichier reste muré. Le format
 * lui-même est éprouvé à part, caractère par caractère, sur la fonction pure.
 */
describe("GET /admin/catalog/export.csv", () => {
  it("sert un CSV nommé, avec son type et son BOM", async () => {
    await push(240);

    const response = await asStaff().get("/admin/catalog/export.csv").expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    // Sans le nom, le fichier atterrit en « export.csv » dans un dossier de
    // téléchargements et ne s'y retrouve plus.
    expect(response.headers["content-disposition"]).toContain("catalogue-b2b.csv");
    expect(response.text.startsWith("\uFEFF")).toBe(true);
    expect(response.text).toContain("VIE-001-1");
    expect(response.text).toContain("2,40");
  });

  it("reste muré : sans jeton staff, rien ne sort", async () => {
    // Un export est une exfiltration complète du catalogue et de ses prix
    // négociés. C'est la route de ce contrôleur qu'il faut le plus garder.
    await ctx.http().get("/admin/catalog/export.csv").expect(401);
  });
});

describe("GET /admin/catalog/summary", () => {
  it("compte ce qui est réellement commandable", async () => {
    await push(240);

    const response = await asStaff().get("/admin/catalog/summary").expect(200);

    expect(jsonBody<{ onSale: number; withoutVatRate: number; hidden: number }>(response)).toEqual({
      onSale: 1,
      withoutVatRate: 0,
      hidden: 0,
    });
  });

  it("bascule l'article masqué d'une colonne à l'autre", async () => {
    await push(240);
    await asStaff().put("/admin/catalog/VIE-001-1/visibility").send({ hidden: true }).expect(204);

    const response = await asStaff().get("/admin/catalog/summary").expect(200);

    expect(jsonBody<{ onSale: number; hidden: number }>(response)).toMatchObject({
      onSale: 0,
      hidden: 1,
    });
  });
});

/**
 * 🔴 **Régression : cette route n'existait pas, et personne ne pouvait le voir.**
 *
 * `b2b/orders/http/admin-catalog.controller.ts` la déclarait sous `@Get()`, avec
 * le même `@Controller("admin/catalog")` que le contrôleur du catalogue
 * ci-dessus. Nest sert le premier enregistré : celle-ci n'a jamais répondu
 * depuis le découpage en blocs. Aucun signal — ni typecheck, ni démarrage, ni
 * test, puisqu'un test qui l'aurait appelée aurait reçu l'AUTRE contrôleur et
 * serait passé ou tombé pour de mauvaises raisons.
 *
 * Ce que ça coûtait : le back-office demandait ce catalogue-ci pour ranger par
 * rayon, et recevait l'autre — SKU de variant, et aucun champ `category`. Le
 * récapitulatif de production, le prévisionnel et la fiche d'atelier mettaient
 * donc TOUTES leurs lignes dans « rayon inconnu » (corrigé le 2026-09-13).
 *
 * Le test tient les deux moitiés du défaut, et il faut les deux : l'adresse
 * répond, ET ce qu'elle rend porte le rayon. Une route qui répond 200 en
 * servant l'autre forme aurait laissé le bug entier.
 */
describe("GET /admin/catalog/sellable", () => {
  it("rend le catalogue vendable AVEC son rayon, sous une adresse à lui", async () => {
    await push(240);

    const response = await asStaff().get("/admin/catalog/sellable").expect(200);
    const items = jsonBody<CatalogItemView[]>(response);

    // Le compte d'abord : une liste vide passerait toutes les assertions qui
    // suivent sans rien affirmer.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Croissant",
      family: { id: "fam-vien", name: "Viennoiseries" },
      // Déprécié, servi à `null` tant qu'un front déployé le lit.
      category: null,
    });
  });

  /**
   * L'autre contrôleur garde son adresse, et sa forme. Sans ce cas, « réparer »
   * la collision en déplaçant le mauvais des deux casserait l'écran du
   * catalogue B2B — qui, lui, marche depuis toujours.
   */
  it("laisse la racine au catalogue B2B, inchangée", async () => {
    await push(240);

    const response = await asStaff().get("/admin/catalog").expect(200);
    const items = jsonBody<{ sku: string; categoryName: string }[]>(response);

    expect(items).toHaveLength(1);
    expect(items[0]?.categoryName).toBe("Viennoiseries");
  });
});
