/**
 * **Le devis du logiciel comptable, refait par notre code.**
 *
 * Un document fabriqué DEHORS — 44 lignes, 292 561,22 € HT — reposé chez nous
 * sous forme de mercuriale, puis redemandé par la route du devis. Les montants
 * attendus ne sortent d'aucun de nos fichiers : ils sont lus sur le PDF. C'est
 * ce qui distingue cette suite de toutes les autres, qui vérifient que le moteur
 * fait ce que son auteur croit qu'il doit faire.
 *
 * Le détail de l'oracle — ce qui a été anonymisé, les deux différences d'arrondi
 * qui s'annulent, ce que le document N'éprouve pas — vit dans
 * {@link ./devis-comptable-fixture.ts}, et il faut l'avoir lu avant de toucher
 * à un chiffre d'ici.
 *
 * ## Ce que la suite traverse VRAIMENT
 *
 * Tout passe par le code servi : la pose de la mercuriale par `POST
 * /admin/pricing/companies/:id/mercuriale`, le chiffrage par `POST
 * /orders/quote`, contre un vrai Postgres. Rien n'est simulé — c'était la
 * condition, parce qu'une arithmétique juste dans un tableur ne dit rien du
 * chemin qui la calcule.
 *
 * ## Ce que ce document a déjà trouvé
 *
 * `MAX_LINE_QUANTITY = 10 000` refusait quatre de ses lignes — 43,6 % du
 * montant, la plus grosse à 101 380 pièces. Aucun de nos tests ne pouvait le
 * voir : ils sont tous écrits par quelqu'un qui connaissait la borne. Le devis
 * a depuis sa borne à lui (`quoteQuantitySchema`), et le panier garde la
 * sienne — les deux derniers cas de cette suite le tiennent.
 */
import type { CustomerOrderQuoteView } from "@lfd/contracts";
import { lineTotalCents, ventilateVat } from "@lfd/money";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  DEVIS_COMPTABLE,
  DEVIS_COMPTABLE_HT_CENTS,
  DEVIS_COMPTABLE_TTC_CENTS,
  DEVIS_COMPTABLE_TVA_CENTS,
} from "./devis-comptable-fixture.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const BUYER = "acheteur-devis-comptable";
/** Le taux du semis de test, et celui de toutes les lignes du document. */
const FOOD_VAT_RATE = 5.5;

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

/**
 * Les bornes sont **relatives** : la mercuriale doit être en vigueur MAINTENANT
 * pour que le devis la voie. Une fenêtre écrite en dur serait verte jusqu'au
 * jour où le calendrier la franchit, puis rouge sans qu'une ligne ait bougé.
 */
function relativeDay(days: number): string {
  const at = new Date();
  at.setUTCHours(0, 0, 0, 0);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString();
}

beforeEach(async () => {
  await ctx.reset();
  const company = await createCompany(ctx.prisma);
  companyId = company.id;
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, companyId);

  await ctx
    .asSub("staff-e2e")
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Devis de saison",
      validFrom: relativeDay(-1),
      validTo: relativeDay(180),
      lines: DEVIS_COMPTABLE.map(({ sku, unitPriceMillicents }) => ({ sku, unitPriceMillicents })),
    })
    .expect(201);
});

const askQuote = () =>
  ctx
    .asSub(BUYER)
    .post("/orders/quote")
    .send({
      companyId,
      lines: DEVIS_COMPTABLE.map(({ sku, quantity }) => ({ sku, quantity })),
    });

const quoted = async (): Promise<CustomerOrderQuoteView> =>
  jsonBody<CustomerOrderQuoteView>(await askQuote().expect(200));

describe("le devis du logiciel comptable, refait par le moteur", () => {
  /**
   * La promesse d'une mercuriale statique : elle traverse **intacte**. Aucune
   * règle ne s'invite, aucun palier ne s'ouvre, aucun plancher ne relève — sans
   * quoi les montants seraient justes par accident.
   */
  it("applique les 44 prix négociés SANS en altérer un seul", async () => {
    const view = await quoted();

    expect(view.lines).toHaveLength(DEVIS_COMPTABLE.length);
    expect(
      view.lines.map((line) => ({ sku: line.sku, unitPriceMillicents: line.unitPriceMillicents })),
    ).toEqual(
      DEVIS_COMPTABLE.map(({ sku, unitPriceMillicents }) => ({ sku, unitPriceMillicents })),
    );
  });

  /**
   * 🔴 Ligne à ligne, et pas seulement sur le total. Le total seul serait vert
   * **par compensation** — deux différences d'arrondi s'y annulent (cf. la
   * fixture) —, et il le resterait jusqu'au panier où elles ne s'annuleraient
   * plus, sans que rien n'explique la panne.
   */
  it("retrouve le montant de CHAQUE ligne du document", async () => {
    const view = await quoted();

    expect(
      view.lines.map((line) => lineTotalCents(line.unitPriceMillicents, line.quantity)),
    ).toEqual(DEVIS_COMPTABLE.map((ligne) => ligne.expectedLineCents));
  });

  it("totalise 292 561,22 € HT, le total du document", async () => {
    expect((await quoted()).subtotalCents).toBe(DEVIS_COMPTABLE_HT_CENTS);
  });

  /**
   * La divergence connue, **testée** plutôt que commentée : 75 × 1,575 € tombe
   * sur un demi exact, le document affiche 118,12 € et nous rendons 118,13 €.
   *
   * Notre arrondi s'éloigne de zéro — `roundToCents` écarte explicitement
   * l'arrondi au pair comme « indéfendable devant un client qui recompte ». Ce
   * cas est le seul des 44 à les départager, et un point de mesure ne retourne
   * pas une règle documentée : le test fige donc l'écart au lieu de le corriger.
   */
  it("diverge du document sur UNE ligne, et sur une seule", async () => {
    const view = await quoted();

    const divergentes = view.lines.filter((line, index) => {
      const ligne = DEVIS_COMPTABLE[index];
      return lineTotalCents(line.unitPriceMillicents, line.quantity) !== ligne?.documentLineCents;
    });

    expect(divergentes).toHaveLength(1);
    expect(divergentes[0]?.sku).toBe("VIE-008");
    // 118,13 € chez nous, 118,12 € sur le document.
    expect(lineTotalCents(157_500, 75)).toBe(11_813);
  });

  /**
   * La TVA du document — 5,5 % sur l'**assiette agrégée**, jamais ligne à
   * ligne. Le calcul ligne à ligne aurait donné 16 090,89 €, deux centimes de
   * trop : c'est la seconde chose que ce document a confirmée.
   *
   * Pas de route pour l'exercer en HTTP : `/orders/quote` s'arrête au HT
   * délibérément, la TVA dépendant d'un acheminement qu'une estimation ne
   * connaît pas. On appelle donc la fonction servie, avec l'assiette que la
   * route vient de rendre.
   */
  it("ventile 16 090,87 € de TVA sur l'assiette du devis, et non par ligne", async () => {
    const view = await quoted();

    const ventilation = ventilateVat({
      lines: view.lines.map((line) => ({
        htCents: lineTotalCents(line.unitPriceMillicents, line.quantity),
        vatRate: line.vatRate,
      })),
      discountCents: 0,
      extras: [],
    });

    expect(ventilation.vat).toEqual([
      { rate: FOOD_VAT_RATE, amountCents: DEVIS_COMPTABLE_TVA_CENTS },
    ]);
    expect(ventilation.totalCents).toBe(DEVIS_COMPTABLE_TTC_CENTS);
  });
});

/**
 * **Le devis n'est pas un panier**, et les deux bornes le disent maintenant
 * séparément. C'est la décision du 2026-09-09, prise parce que ce document —
 * un engagement de saison parfaitement ordinaire — était refusé par une borne
 * écrite pour protéger le fournil d'un zéro de trop sur un écran tactile.
 */
describe("la borne de quantité, séparée le jour où un vrai devis l'a franchie", () => {
  it("chiffre une ligne de 101 380 pièces, que l'ancienne borne refusait", async () => {
    const view = await quoted();

    expect(view.lines[0]).toMatchObject({ sku: "VIE-001", quantity: 101_380 });
    expect(view.lines.filter((line) => line.quantity > 10_000)).toHaveLength(4);
  });

  /**
   * 🔴 L'autre moitié de la décision, et celle qu'un élargissement distrait
   * emporterait : le **panier** reste borné. Il écrit, il encaisse, il part au
   * fournil — c'est là que la quantité absurde doit être refusée à la
   * frontière plutôt que constatée au four.
   */
  it("refuse toujours cette quantité sur une COMMANDE", async () => {
    await ctx
      .asSub(BUYER)
      .post("/orders")
      .send({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        companyId,
        requestedDeliveryDate: relativeDay(7).slice(0, 10),
        note: "",
        fulfillmentMethod: "pickup",
        lines: [{ sku: "VIE-001", quantity: 101_380 }],
      })
      .expect(400);
  });
});
