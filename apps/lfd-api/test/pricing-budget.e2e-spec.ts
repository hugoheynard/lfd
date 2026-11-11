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
import { WORKSPACE_HEADER } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { CustomerRole } from "../src/platform/database/client/client.js";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

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
  "VIE-001-1",
  "VIE-002-1",
  "VIE-003-1",
  "VIE-004-1",
  "VIE-005-1",
  "PAI-001-1",
  "PAI-002-1",
  "PAI-003-1",
  "PAI-004-1",
  "PAI-005-1",
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
 * **Le budget d'un devis, à froid.** Catalogue, règles, planchers, barèmes,
 * plus l'estampille du cache : **cinq** lectures en lot, quelle que soit la
 * taille du panier.
 *
 * Ce nombre est la **thèse** du fichier, pas un réglage. S'il change, ce n'est
 * pas la constante qu'il faut mettre à jour : c'est une lecture qui vient
 * d'apparaître ou de disparaître, et il faut savoir laquelle.
 *
 * 🔴 **Il est passé de 4 à 5 le 2026-09-09, et voici laquelle.** Le cache des
 * matériaux lit désormais une **estampille** — le dernier `pricing_events.id` —
 * avant de servir ce qu'il garde. Sans elle, il supposait **une seule instance
 * de l'API** : une règle posée sur l'instance A n'invalidait pas l'instance B,
 * qui aurait facturé l'ancien prix jusqu'à son redémarrage. Pas une lenteur, un
 * prix faux (défaut R7).
 *
 * La lecture achète donc la **correction** du cache, et le cache reste gagnant :
 * sans lui ces trois tables coûteraient trois lectures, avec estampille elles en
 * coûtent une. Les trois lecteurs partagent la même, étant appelés dans un seul
 * `Promise.all`.
 *
 * 🔴 **Il est passé de 5 à 6 le 2026-09-14, et voici laquelle.** `POST
 * /shop/quote` porte `@RequiresShop('browse')` : la garde `FeatureAccessGuard`
 * lit la dérogation du flag boutique (`feature_access_overrides`) avant la
 * requête. Une lecture, **constante** — elle ne dépend ni du panier ni des
 * règles, et une route publique n'a pas de personne dont lire l'exemption.
 * Elle n'est pas mise en cache, délibérément : un cache laissait passer des
 * devis et des commandes pendant sa durée après une fermeture posée en admin
 * (plan `plan-inscription-pro-seule.md` §2.1).
 *
 * 🔴 **Il est passé de 6 à 7 le 2026-09-24, et voici laquelle.** Le devis
 * applique le garde des opérations datées (`SaleOperations.boundItems`, lot 3
 * de `architecture-operations-datees.md`) : il lit l'ensemble des SKU réservés
 * aux opérations (`operationOnlySkus`), UNE fois pour le panier, avant de savoir
 * si l'une de ses lignes en fait partie. Constante — elle ne dépend ni du nombre
 * de lignes ni des règles —, et c'est elle qui permet de ne RIEN lire de plus
 * quand le panier n'en contient aucun, le cas de presque tous les devis.
 *
 * 🔴 **De 7 à 8 le 2026-10-08** : le devis lit le mode de TVA de la livraison
 * (`OrderDeliveryVatReader`, plan `documentation/commandes/bon-et-pieces/architecture-tva-des-frais-de-port.md`),
 * UNE fois par devis, pour répondre comme la passation. Constante elle aussi.
 *
 * 🔴 **De 8 à 7 le 2026-10-09** : la lecture du flag boutique (celle du
 * 2026-09-14, plus haut) a disparu avec la clé `shop` et sa garde.
 *
 * 🔴 **De 7 à 8, puis de nouveau 7, le 2026-10-29** : le devis a lu
 * `sale_sku_alias` une fois, le temps que la bascule du défaut garde une table
 * de traduction ; elle est partie sans alias (décision de Hugo,
 * `documentation/catalogue/plan-defaut-sous-sa-reference.md`, révision 3), et
 * la lecture avec elle. Le même jour, la lecture de plus qu'avait ajoutée le
 * tri des lignes d'unité périmée (`withoutStaleUnits`, commit d0b359c27) est
 * RETIRÉE : le tri et le prix lisent la même résolution du catalogue.
 *
 * 🔴 **De 7 à 8 le 2026-10-30** : le chargeur des prix lit la SOURCE des
 * promotions (`promotion_settings.promotions_source`, `documentation/promotions/promotions.md`, § 2.2, lot L5) — une ligne de configuration en base, pas une variable
 * d'environnement, pour que la bascule n'existe que si la migration de
 * contrôle l'a posée. UNE lecture par devis à froid, constante, gardée sous
 * l'estampille du cache (zéro à chaud). Sous `legacy`, rien d'autre n'est lu.
 *
 * 🔴 **De 8 à 9 le 2026-10-30** (lot L10 du même plan) : le devis ANONYME se
 * demande ce qu'une connexion ouvrirait (`GuestSignInOffer`) — « Vous avez un
 * compte ? Connectez-vous pour profiter de −20 % ». Il relit la source, gardée
 * sous le cache, mais l'estampille se relit à chaque question au cache
 * (`PricingMaterialsCache.of`) : UNE lecture de plus, constante, à froid comme
 * à chaud. Sous `legacy`, rien d'autre ; sous `promotions`, les promotions
 * (cachées) et le rangement des lignes, seulement s'il y a une candidate.
 *
 * 🔴 **De 9 à 10 le 2026-10-30** (lot L12 du même plan) : le harnais pose
 * désormais la source servie en production, `promotions`, au lieu de
 * `legacy` — et l'ancien chemin, qui ne lisait rien de plus, est retiré. Le
 * devis à froid lit donc ce que la production lit sous `promotions` (les
 * promotions de ligne et de panier, que `legacy` ne lisait pas). Mesuré ce
 * jour-là : 10, constant, pour une ligne comme pour dix ; le détail requête
 * par requête n'a pas été relevé.
 *
 * 🔴 **De 10 à 11 le 2026-11-03** (lot L2 de `le-prix-d-un-panier.md`,
 * d43dbfe76) : le devis CLASSE toujours ses articles (`PricingContext.loadCart`
 * → `classify`, une lecture de `catalog_items` en lot) — décision É2 de
 * l'inventaire C0 : avant, il ne classait que si une promotion admise à toute
 * heure portait des règles, et la question « classer ou non » pouvait rater
 * une promotion. Ce n'est pas un doublon : la résolution des prix ne rend ni
 * produit ni chemin de famille. Mesuré par trace des modèles, avant/après.
 *
 * 🔴 **De 11 à 10 le 2026-11-04** (chantier « optimisation des lectures »,
 * `le-prix-d-un-panier.md`, § « Les lectures du chiffrage, mesurées ») :
 * l'estampille du cache des matériaux se lit UNE fois par requête au lieu
 * d'une fois par question au cache (`PricingMaterialsCache.stamp`) — le devis
 * anonyme en payait deux (le chargeur des prix, l'offre de connexion). Mesuré
 * par trace des modèles, avant/après.
 *
 * 🔴 **De 10 à 9 le 2026-11-06** (lot M1b de
 * `documentation/caching-usage/le-catalogue-en-memoire.md`) : le devis lit
 * le catalogue dans l'instantané. Les trois lectures de `catalog_items` (les
 * lignes, les SKU d'opération, le classement) deviennent les numéros de
 * `context_versions` et UN chargement des articles. Mesuré par trace des
 * modèles (`catalogue-reads.e2e-spec.ts`).
 *
 * ⚠️ **La thèse du fichier n'a pas bougé** : ce qui compte n'est pas 4, 5, 6, 7
 * ou 8, c'est que dix lignes coûtent le même nombre qu'une seule. C'est
 * l'égalité qui attrape un N+1, pas la valeur absolue.
 */
const COLD_QUOTE_OPS = 9;

/**
 * **Le même devis, à chaud** (2026-11-04) : les matériaux sont en mémoire, il
 * reste le catalogue (prix de ligne, articles réservés aux opérations,
 * classement), le mode de TVA du port — et UNE estampille. Ce chiffre garde
 * l'estampille par requête : une question de plus au cache qui relirait le
 * journal le ferait monter.
 *
 * 🔴 **De 5 à 3 le 2026-11-06** (lot M1b, plan des matériaux du catalogue) :
 * à chaud, le catalogue ne coûte plus que les numéros de `context_versions`
 * (un visiteur n'a pas de réservations à lire). Restent le mode de TVA du port
 * et l'estampille des prix.
 */
const WARM_QUOTE_OPS = 3;

/**
 * Sème `count` règles **distinctes** — d'étage `geste` depuis L12
 * (2026-10-30) : l'étage `promotion` n'est plus lu par le prix, et des
 * règles que personne ne lirait ne mesureraient rien.
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
    select: { sku: true },
    distinct: ["sku"],
    orderBy: { sku: "asc" },
  });
  const skus = catalogue.map((item) => item.sku);
  await ctx.prisma.priceRule.createMany({
    data: Array.from({ length: count }, (_unused, index) => ({
      id: `rule_budget_${String(index)}`,
      stage: "geste",
      nature: "alter",
      scopeType: "product",
      scopeId: skus[index % skus.length] ?? "VIE-001-1",
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
  it("coûte le budget à froid pour une seule ligne", async () => {
    await seedRules(40);

    const cost = await coldOperationsOf(() =>
      quote([{ sku: "VIE-001-1", quantity: 2 }]).expect(200),
    );

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
   * À chaud, une seule estampille par requête, quelle que soit la taille du
   * panier. Un premier devis, non compté, chauffe le cache.
   */
  it("coûte le budget à chaud, une seule estampille par requête", async () => {
    await seedRules(40);
    const lines = SKUS.map((sku) => ({ sku, quantity: 2 }));
    await quote(lines).expect(200);

    const cost = await coldOperationsOf(() => quote(lines).expect(200));

    expect(cost).toBe(WARM_QUOTE_OPS);
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
      .set(INTENT_KEY, freshIntent())
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
      .set(INTENT_KEY, freshIntent())
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

    // La source des promotions est gardée sous le cache des matériaux (L8,
    // le tableau la lit comme la caisse) : la première lecture du processus
    // la paie, pas la seconde. Une lecture d'amorce, non comptée, met les
    // deux mesures au même régime — ce qu'on compare est la mercuriale.
    await staff().get(`/admin/pricing/companies/${without.id}`).expect(200);
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

/**
 * 🔴 **L'écran et la caisse annoncent le MÊME prix.**
 *
 * C'était faux jusqu'au 2026-09-08 : sur un article dont un barème s'ouvre dès
 * la première pièce, `GET /admin/pricing` annonçait 1,83924 € pendant que
 * `POST /shop/quote` facturait 1,65532 €. Dix pour cent d'écart, sur le seul
 * écran qu'un commercial regarde avant d'accorder un prix.
 *
 * La cause n'était pas une erreur de calcul : c'était un ÉTAGE OUBLIÉ. L'écran
 * recevait les barèmes en paramètre et ne les passait pas à `resolvePrice`.
 * Rien ne rougissait — un prix sans son barème reste un prix plausible.
 *
 * Ce cas est la preuve que l'assemblage a changé de côté. Il ne teste aucune
 * valeur en particulier : il exige que les deux chemins **tombent d'accord**,
 * ce qui reste vrai quels que soient les tarifs du catalogue.
 */
describe("l'écran et la caisse", () => {
  it("🔴 annoncent le même prix quand un barème s'ouvre dès la première pièce", async () => {
    await ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder_accord",
        scopeType: "product",
        scopeId: "VIE-001-1",
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [{ minQuantity: 1, value: 1_000 }],
        label: "Barème dès la première pièce",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
        createdBy: "e2e",
      },
    });

    const board = jsonBody<{
      categories: readonly { items: readonly { sku: string; finalMillicents: number }[] }[];
    }>(await staff().get("/admin/pricing").expect(200));
    const shown = board.categories
      .flatMap((category) => category.items)
      .find((item) => item.sku === "VIE-001-1")?.finalMillicents;

    // 🔴 **Le devis est passé PAR UN PRO**, et depuis le 2026-09-21 il faut le
    // dire. `/admin/pricing` est l'écran du canal professionnel ; la caisse d'un
    // visiteur anonyme sert l'étiquette publique. Les comparer revenait à
    // vérifier que deux audiences lisent le même prix — ce que ce chantier
    // interdit. Le cas était vert parce qu'il n'y avait qu'un prix.
    const acheteur = await createUser(ctx.prisma, { auth0Sub: "auth0|parite" });
    const societe = await createCompany(ctx.prisma);
    await attachTo(ctx.prisma, acheteur.id, societe.id, CustomerRole.orders);

    const quoted = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
      await ctx
        .asSub("auth0|parite")
        .post("/shop/quote/mine")
        .send({ lines: [{ sku: "VIE-001-1", quantity: 1 }], fulfillment: null })
        .expect(200),
    ).lines[0]?.unitPriceMillicents;

    expect(shown).toBe(quoted);
  });
});

/**
 * 🔴 **Le cache survit à une DEUXIÈME instance** (défaut R7, corrigé le
 * 2026-09-09).
 *
 * ## Ce que ce cas simule, et pourquoi il ne peut pas faire mieux
 *
 * Un e2e ne peut pas booter deux applications sur la même base pour de vrai —
 * ce serait deux processus, deux ports, un harnais entier. Ce qu'il PEUT faire
 * est exactement ce qui compte : produire l'état qu'une seconde instance
 * produirait, c'est-à-dire une écriture tarifaire **que cette instance-ci n'a
 * pas faite** et dont elle n'a donc jamais reçu l'invalidation.
 *
 * D'où le semis direct en base, `invalidate()` volontairement **non appelé**.
 * Sans estampille, ce cas rendrait l'ancien prix jusqu'au redémarrage — pas une
 * lenteur, un prix faux.
 */
describe("le cache des matériaux, vu d'une autre instance", () => {
  it("🔴 sert le nouveau prix après une écriture qu'il n'a pas faite", async () => {
    // Un premier devis chauffe le cache : les trois tables sont en mémoire.
    const avant = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
      await ctx
        .http()
        .post("/shop/quote")
        .send({ lines: [{ sku: "VIE-001-1", quantity: 1 }], fulfillment: null })
        .expect(200),
    ).lines[0]?.unitPriceMillicents;

    // « L'autre instance » pose une règle (d'étage `geste` depuis L12 : l'étage
    // `promotion` n'est plus lu) : la règle ET son acte au journal,
    // comme `PricingActWriter` le ferait — mais SANS toucher au cache d'ici.
    await ctx.prisma.priceRule.create({
      data: {
        id: "rule_autre_instance",
        stage: "geste",
        nature: "alter",
        scopeType: "global",
        scopeId: null,
        audienceType: "all",
        audienceId: null,
        minQuantity: null,
        direction: "decrease",
        mode: "percent",
        value: 5_000,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
        label: "Posée ailleurs",
        stacksOverMercuriale: false,
        createdBy: "autre-instance",
      },
    });
    await ctx.prisma.pricingEvent.create({
      data: {
        // Un ULID plus grand que tout ce qui existe : c'est ce que l'estampille
        // compare, et c'est ce qu'un vrai acte produirait.
        id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ",
        subjectType: "rule",
        subjectId: "rule_autre_instance",
        act: "posed",
        actor: "autre-instance",
        summary: "Promotion posée par une autre instance",
      },
    });

    const apres = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
      await ctx
        .http()
        .post("/shop/quote")
        .send({ lines: [{ sku: "VIE-001-1", quantity: 1 }], fulfillment: null })
        .expect(200),
    ).lines[0]?.unitPriceMillicents;

    expect(avant).toBeDefined();
    // −50 % : le cache a vu l'estampille bouger et rechargé.
    expect(apres).toBe(Math.round((avant ?? 0) / 2));
  });
});

/**
 * **Le budget de l'estimation de la saisie** (`POST /admin/orders/estimate`,
 * plan `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2).
 *
 * Elle compose la commande entière sans l'écrire : le payeur, la porte de la
 * boutique, la marque, la résolution des prix, l'acheminement et sa remise,
 * l'heure limite, les CGV — puis le jugement du crédit et l'heure limite
 * affichée. `vitruve` l'estimait à une quinzaine de lectures ; le chiffre
 * ci-dessous est MESURÉ (2026-11-03), à froid, au retrait et au compte :
 * **33**, porte de la surface staff comprise (identité, droits — leur part
 * n'a pas été isolée), le même pour une ligne et pour dix.
 *
 * 🔴 **De 33 à 31 le 2026-11-04** : l'estampille du cache des matériaux se
 * lit une fois par requête (le chargeur des prix, la remise du point et les
 * promotions panier la relisaient chacun). Mesuré par trace des modèles.
 *
 * 🔴 **De 31 à 28 le 2026-11-06** (lot M1b, plan des matériaux du catalogue) :
 * les lignes lues trois fois, les SKU d'opération, le classement et l'heure
 * limite lue deux fois (sept lectures) deviennent les numéros, les
 * réservations du client, les articles et l'heure limite (quatre).
 *
 * Il est plus cher qu'un devis, et c'est le prix d'une seule arithmétique :
 * le front ne l'appelle qu'une fois la saisie assez complète, après 400 ms
 * d'inactivité. Ce qui compte ici, comme pour le devis, est qu'il ne suive
 * pas la taille du panier.
 */
const COLD_ESTIMATE_OPS = 28;

describe("l'estimation de la saisie", () => {
  async function seedBuyer(): Promise<Record<string, unknown>> {
    const site = await ctx.prisma.site.create({
      data: {
        label: "Labo",
        ligne1: "1 rue du Four",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    });
    const company = await createCompany(ctx.prisma, { status: "active" });
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: ["monthly"] },
    });
    const buyer = await createUser(ctx.prisma, {
      auth0Sub: "auth0|budget-estimation",
      email: "budget-estimation@test.fr",
    });
    await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
    return {
      companyId: company.id,
      buyerUserId: buyer.id,
      settlement: "account",
      requestedDeliveryDate: serviceDay(),
      fulfillmentMethod: "pickup",
      pickupAddressId: site.id,
      requestedWindow: { start: "07:00", end: "08:00" },
      note: "",
    };
  }

  const estimate = (body: Record<string, unknown>) =>
    staff().post("/admin/orders/estimate").send(body).expect(200);

  it("coûte le budget à froid pour une seule ligne", async () => {
    const body = await seedBuyer();

    const cost = await coldOperationsOf(() =>
      estimate({ ...body, lines: [{ sku: "VIE-001-1", quantity: 2 }] }),
    );

    expect(cost).toBe(COLD_ESTIMATE_OPS);
  });

  it("🔴 coûte EXACTEMENT AUTANT pour dix lignes que pour une", async () => {
    const body = await seedBuyer();

    const cost = await coldOperationsOf(() =>
      estimate({ ...body, lines: SKUS.map((sku) => ({ sku, quantity: 2 })) }),
    );

    expect(cost).toBe(COLD_ESTIMATE_OPS);
  });
});

/**
 * **Le devis d'un client rattaché à une société, avec un jour** (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, T1) : il juge la
 * surtaxe de retard comme la passation — l'heure limite, la dérogation lue
 * sans être consommée. Ces lectures sont constantes : elles ne dépendent pas
 * du nombre de lignes, et la surtaxe ne se lit que si une dérogation sert.
 *
 * Mesuré le 2026-11-03 : **20**, dont **3** pour le jugement (17 sans jour,
 * même panier) — les règles d'heure limite, les limites des articles en un
 * lot, la dérogation ouverte. Le jour choisi n'est pas aujourd'hui : l'arrêt
 * du plan n'est pas relu.
 *
 * 🔴 **De 20 à 21 le 2026-11-04** (lot L4, `ad5c80190`,
 * `documentation/caching-usage/qui-est-le-client.md`) : chaque
 * requête identifiée lit l'estampille du principal AVANT de le servir de la
 * mémoire ou de le relire. À froid, le principal est relu ET l'estampille
 * lue : une lecture de plus, constante, que la mémoire rembourse aux appels
 * suivants (le principal n'y est plus relu). Le devis anonyme et l'estimation
 * du staff ne passent pas par ce résolveur et ne bougent pas.
 *
 * 🔴 **De 21 à 20 le 2026-11-06** (lot M1b, plan des matériaux du catalogue) :
 * les lignes lues deux fois, les SKU d'opération, le classement et l'heure
 * limite (cinq lectures) deviennent les numéros, les réservations de la
 * société, les articles et l'heure limite (quatre).
 */
const COLD_COMPANY_QUOTE_OPS = 20;

describe("le devis d'une société, un jour choisi", () => {
  async function seedBuyer(): Promise<string> {
    const company = await createCompany(ctx.prisma, { status: "active" });
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|budget-societe" });
    await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.orders);
    return company.id;
  }

  const quote = (companyId: string, lines: readonly { sku: string; quantity: number }[]) =>
    ctx
      .asSub("auth0|budget-societe")
      .set(WORKSPACE_HEADER, companyId)
      .post("/shop/quote/mine")
      .send({ lines: [...lines], fulfillment: null, requestedDeliveryDate: serviceDay() })
      .expect(200);

  it("coûte le budget à froid pour une seule ligne", async () => {
    const companyId = await seedBuyer();
    const cost = await coldOperationsOf(() =>
      quote(companyId, [{ sku: "VIE-001-1", quantity: 2 }]),
    );
    expect(cost).toBe(COLD_COMPANY_QUOTE_OPS);
  });

  it("🔴 coûte EXACTEMENT AUTANT pour dix lignes que pour une", async () => {
    const companyId = await seedBuyer();
    const cost = await coldOperationsOf(() =>
      quote(
        companyId,
        SKUS.map((sku) => ({ sku, quantity: 2 })),
      ),
    );
    expect(cost).toBe(COLD_COMPANY_QUOTE_OPS);
  });
});
