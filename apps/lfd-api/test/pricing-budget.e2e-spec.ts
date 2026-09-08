/**
 * E2E du **budget d'opérations de la chaîne des prix**.
 *
 * ## Pourquoi compter, et pas chronométrer
 *
 * Un chronomètre en intégration continue mesure la machine autant que le code :
 * il rougit un mardi sur cinq pour des raisons qui n'ont rien à voir, et une
 * suite qui rougit sans raison finit désactivée. Ce qui est **déterministe**,
 * c'est le nombre d'appels ORM — l'unité que Prisma Postgres facture, et
 * l'unité dans laquelle un N+1 se lit.
 *
 * Le budget porte donc sur des **opérations**, pas sur des millisecondes.
 *
 * ## Ce que ces cas éprouvent, et que rien d'autre n'éprouve
 *
 * Un N+1 ne se voit **jamais** sur un jeu de données de test : trois articles,
 * trois requêtes de plus, personne ne le remarque. Il se voit en production, sur
 * le chemin qui facture, le jour où un panier fait vingt lignes. `materialsOf`
 * existe précisément pour ça — son JSDoc raconte les soixante requêtes qu'un
 * panier de vingt lignes provoquait.
 *
 * Ces cas transforment cette phrase en garde-fou : **le coût ne suit pas la
 * taille du panier.** Si quelqu'un remet une lecture par article, la suite le
 * dit, avec le chiffre.
 *
 * ⚠️ Le compteur mesure les opérations **du processus entier**, pas d'une
 * requête. Les cas ci-dessous prennent donc un instantané avant et après, et
 * s'assurent qu'aucun travail hors requête ne tourne entre les deux (`drain`).
 */
import { millicentsFromCents } from "@lfd/money";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/**
 * Le `sub` doit être celui que le harnais sème dans l'annuaire — porter un jeton
 * valide ne suffit pas depuis que la surface admin est murée. En inventer un
 * autre donne un `403` qui accuse le mauvais coupable.
 */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let counter: SchemaOpsCounter;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
  counter = ctx.app.get(SchemaOpsCounter);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Des SKU réels du catalogue e2e — 93 articles y sont semés. */
const SKUS = [
  "VIE-001",
  "VIE-002",
  "VIE-003",
  "VIE-004",
  "VIE-005",
  "PAI-001",
  "PAI-002",
  "PAI-003",
  "PAI-004",
  "PAI-005",
] as const;

/**
 * Le coût **à froid**, en opérations ORM, du premier appel de ce test.
 *
 * ## Pourquoi à froid
 *
 * Un devis coûte **quatre** opérations au premier appel et **une** aux suivants :
 * un cache en sert trois. Mesurer à chaud comparait donc deux caches, pas deux
 * lectures — et le premier jet de ce fichier annonçait fièrement que dix lignes
 * coûtaient autant qu'une, en comparant `1` à `1`. C'était vrai, et vide.
 *
 * À froid, chaque lecture est réellement posée. C'est là, et seulement là,
 * qu'un N+1 se voit.
 *
 * ⚠️ **Un seul appel mesuré par test.** `beforeEach` remet la base à zéro et
 * resème le catalogue, ce qui rend le cache caduc : le premier appel d'un test
 * est froid, les suivants ne le sont plus. Deux mesures dans le même cas
 * compareraient une lecture à un cache.
 *
 * `drain` des deux côtés : les abonnés du journal et l'évaluation d'alertes
 * tournent hors requête, et une opération qui traîne d'un cas au suivant ferait
 * rougir le mauvais.
 */
async function coldOperationsOf(run: () => Promise<unknown>): Promise<number> {
  await ctx.drain();
  const before = counter.total();
  await run();
  await ctx.drain();
  return counter.total() - before;
}

/**
 * **Le budget d'un devis, à froid.** Catalogue, règles, planchers, barèmes :
 * quatre lectures en lot, quelle que soit la taille du panier.
 *
 * Ce nombre est la **thèse** du fichier, pas un réglage. S'il change, ce n'est
 * pas la constante qu'il faut mettre à jour : c'est une lecture qui vient
 * d'apparaître ou de disparaître, et il faut savoir laquelle.
 */
const COLD_QUOTE_OPS = 4;

/**
 * Sème `count` règles de promotion **distinctes**.
 *
 * ⚠️ Distinctes, et le premier jet ne l'était pas : la contrainte d'exclusion a
 * refusé le semis, parce que dix règles visaient le même article sur la même
 * fenêtre. Elle a raison — c'est exactement ce qu'elle existe pour empêcher.
 *
 * Le seuil de quantité fait donc partie de la clé : une règle par article et
 * par seuil, ce qui donne des règles réalistes plutôt qu'un tas de doublons que
 * la base n'accepterait jamais en production.
 */
async function seedRules(count: number): Promise<void> {
  const catalogue = await ctx.prisma.catalogItem.findMany({
    select: { productSku: true },
    distinct: ["productSku"],
    orderBy: { productSku: "asc" },
  });
  const skus = catalogue.map((item) => item.productSku);
  await ctx.prisma.priceRule.createMany({
    data: Array.from({ length: count }, (_unused, index) => ({
      id: `rule_budget_${String(index)}`,
      stage: "promotion",
      nature: "alter",
      scopeType: "product",
      scopeId: skus[index % skus.length] ?? "VIE-001",
      audienceType: "all",
      audienceId: null,
      // Le seuil départage : une règle par article ET par palier.
      minQuantity: 1 + Math.floor(index / skus.length),
      direction: "decrease",
      mode: "percent",
      value: 500,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      label: `Promo budget ${String(index)}`,
      stacksOverMercuriale: false,
      createdBy: "e2e",
    })),
  });
}

describe("le devis d'un panier", () => {
  const quote = (lines: readonly { sku: string; quantity: number }[]) =>
    ctx
      .http()
      .post("/shop/quote")
      .send({ lines: [...lines], fulfillment: null });

  /**
   * 🔴 **Le cas qui justifie tout ce fichier.**
   *
   * Un panier de dix lignes ne doit pas coûter dix fois un panier d'une ligne.
   * Les matériaux — règles, planchers, barèmes, engagements, mercuriale — se
   * lisent **une fois pour le panier**, et se rangent par portée.
   *
   * L'égalité est **stricte**, et c'est possible parce que la mesure est un
   * nombre d'appels ORM et non une durée. Une inégalité ici n'est pas du bruit :
   * c'est une lecture par article qui vient de réapparaître.
   */
  it("coûte QUATRE lectures pour une seule ligne", async () => {
    await seedRules(40);

    const cost = await coldOperationsOf(() => quote([{ sku: "VIE-001", quantity: 2 }]).expect(200));

    expect(cost).toBe(COLD_QUOTE_OPS);
  });

  /**
   * 🔴 **Le cas qui justifie tout ce fichier.**
   *
   * Dix lignes coûtent **exactement** ce qu'une ligne coûte — la même constante,
   * dans un autre test, sur un cache également froid. Les matériaux se lisent
   * une fois pour le panier et se rangent par portée ; `materialsOf` existe pour
   * ça, et son JSDoc raconte les soixante requêtes qu'un panier de vingt lignes
   * provoquait avant lui.
   *
   * L'égalité est **stricte**, et c'est possible parce que la mesure est un
   * nombre d'appels ORM et non une durée. Une inégalité ici n'est pas du bruit :
   * c'est une lecture par article qui vient de réapparaître.
   */
  it("🔴 coûte EXACTEMENT AUTANT pour dix lignes que pour une", async () => {
    await seedRules(40);

    const cost = await coldOperationsOf(() =>
      quote(SKUS.map((sku) => ({ sku, quantity: 2 }))).expect(200),
    );

    expect(cost).toBe(COLD_QUOTE_OPS);
  });

  /**
   * Le nombre de RÈGLES ne change rien non plus : elles se lisent en un `WHERE`
   * dont la clause ne dépend que de la fenêtre, de l'audience et des portées du
   * panier — un `IN`, pas une requête par règle.
   */
  it("ne coûte pas plus cher quand le catalogue porte 200 règles", async () => {
    // Les règles se lisent en UN `WHERE` dont la clause ne dépend que de la
    // fenêtre, de l'audience et des portées du panier — un `IN`, pas une requête
    // par règle.
    await seedRules(200);

    const cost = await coldOperationsOf(() =>
      quote(SKUS.map((sku) => ({ sku, quantity: 2 }))).expect(200),
    );

    expect(cost).toBe(COLD_QUOTE_OPS);
  });

  /**
   * Un plafond **absolu**, en plus des égalités.
   *
   * Les deux cas au-dessus attrapent une régression *relative* — le coût qui se
   * met à suivre la taille du panier. Ils ne diraient rien si quelqu'un ajoutait
   * dix lectures constantes. Ce chiffre-là est délibérément lâche : il n'est pas
   * là pour optimiser, il est là pour qu'un doublement se voie.
   */
});

describe("le tableau de tarification", () => {
  /**
   * 🔴 **Quatre-vingt-treize articles, et un coût qui ne les compte pas.**
   *
   * L'écran résout tout le catalogue contre toutes les règles vivantes. Le
   * risque n'est pas le calcul — il est en mémoire, et `boardMaterials` existe
   * pour éviter le produit articles × règles — mais la **lecture** : une requête
   * par article, ou par famille, ne se remarquerait pas avant la production.
   */
  it("🔴 ne lit pas la base une fois par article", async () => {
    await seedRules(120);

    const cost = await coldOperationsOf(() => staff().get("/admin/pricing").expect(200));

    // 93 articles au catalogue e2e. Un coût sous 30 opérations dit que la
    // lecture est en lot ; un coût qui approcherait 93 dirait l'inverse.
    expect(cost).toBeLessThan(30);
  });

  /**
   * L'onglet Tarifs d'une fiche fait sa **propre** lecture — il n'emprunte pas
   * celle du tableau général. C'est le troisième site de chargement, celui que
   * deux versions du plan de la mercuriale avaient oublié.
   */
  it("🔴 ne lit pas la base une fois par article, sur la fiche d'un client non plus", async () => {
    const company = await createCompany(ctx.prisma);
    await seedRules(120);
    await staff()
      .post(`/admin/pricing/companies/${company.id}/mercuriale`)
      .send({
        label: "Budget",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2027-01-01T00:00:00.000Z",
        lines: SKUS.map((sku) => ({
          sku,
          unitPriceMillicents: millicentsFromCents(150),
        })),
      })
      .expect(201);

    const cost = await coldOperationsOf(() =>
      staff().get(`/admin/pricing/companies/${company.id}`).expect(200),
    );

    expect(cost).toBeLessThan(30);
  });

  /**
   * La mercuriale ne coûte **rien de plus** : elle est un objet, donc une
   * lecture. Elle a coûté une règle par article — quatre-vingt-douze lignes à
   * relire et à recoller — jusqu'au 2026-09-08.
   */
  it("ne coûte pas plus cher parce que le client a une mercuriale", async () => {
    const withMercuriale = await createCompany(ctx.prisma);
    const without = await createCompany(ctx.prisma);
    await staff()
      .post(`/admin/pricing/companies/${withMercuriale.id}/mercuriale`)
      .send({
        label: "Budget",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2027-01-01T00:00:00.000Z",
        lines: SKUS.map((sku) => ({
          sku,
          unitPriceMillicents: millicentsFromCents(150),
        })),
      })
      .expect(201);

    const bare = await coldOperationsOf(() =>
      staff().get(`/admin/pricing/companies/${without.id}`).expect(200),
    );
    const negotiated = await coldOperationsOf(() =>
      staff().get(`/admin/pricing/companies/${withMercuriale.id}`).expect(200),
    );

    expect(negotiated).toBe(bare);
  });
});

describe("ce que le budget ne dit pas", () => {
  /**
   * Une opération ORM n'est pas une milliseconde. Ce cas existe pour que la
   * suite porte sa propre limite : elle prouve qu'on ne parle pas trop à la
   * base, pas que la base répond vite.
   *
   * Le plafond est **très** lâche — un ordre de grandeur au-dessus de ce qu'on
   * observe. Il n'attrape qu'une catastrophe : une lecture qui part en boucle,
   * un verrou. Le resserrer le rendrait instable, et une suite instable ne dit
   * plus rien.
   */
  it("répond en moins de trois secondes, catalogue complet et 200 règles", async () => {
    await seedRules(200);

    const startedAt = Date.now();
    await staff().get("/admin/pricing").expect(200);

    expect(Date.now() - startedAt).toBeLessThan(3_000);
  });
});
