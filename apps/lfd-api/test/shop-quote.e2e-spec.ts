/**
 * E2E du **devis de la vitrine** — la seconde surface servie sans jeton.
 *
 * Ce qu'aucun test unitaire ne prouverait, et qui est tout l'objet du chantier :
 * ce décompte doit être **le même** que celui de la caisse, au centime. Il
 * traverse donc le vrai SQL — points de retrait, zones, catalogue — et compare
 * ses nombres à ceux qu'une commande produirait sur le même panier.
 *
 * La seconde chose qu'il tient : ce qui FRANCHIT. La réponse est publique, et un
 * champ ajouté par mégarde — un libellé de règle, un plancher, donc une marge —
 * serait public le jour du déploiement. D'où un test qui énumère les clés.
 */
import type { ShopQuotePayload, ShopQuoteView } from "@lfd/contracts";
import request from "supertest";

import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

/** 1,00 € HT à 5,5 % et 3,00 € HT à 10 % — deux taux, comme une vraie facture. */
async function seedCatalogue(): Promise<void> {
  await ctx.app.get(B2bCatalogDriver).send(
    snapshotOf([
      { sku: "VIE-001", priceMillicents: 100_000 },
      { sku: "TRA-001", priceMillicents: 300_000, vatRatePercent: 10 },
    ]),
    { revisionId: "rev_quote", fingerprint: "empreinte-quote" },
  );
}

/** Un point de retrait qui remet, sous l'une ou l'autre des deux formes. */
async function seedPickup(mode: "percent" | "amount", value: number): Promise<string> {
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Le Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
      discountMode: mode,
      discountValue: value,
    },
    select: { id: true },
  });
  return point.id;
}

/** Une zone à frais fixe de 20 € HT. */
async function seedZone(): Promise<void> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2_000 },
  });
}

/** Sans jeton : c'est tout l'objet de cette route. */
const quote = (payload: ShopQuotePayload) =>
  request(ctx.app.getHttpServer()).post("/shop/quote").send(payload);

const PANIER: ShopQuotePayload["lines"] = [
  { sku: "VIE-001", quantity: 12 },
  { sku: "TRA-001", quantity: 4 },
];

describe("le devis de la vitrine", () => {
  it("répond SANS jeton — on chiffre avant de s'identifier", async () => {
    await seedCatalogue();

    const { status } = await quote({ lines: PANIER, fulfillment: null });

    expect(status).toBe(200);
  });

  it("compose le décompte dans l'ordre d'une facture, une ligne par taux", async () => {
    await seedCatalogue();

    const view = jsonBody<ShopQuoteView>(
      await quote({ lines: PANIER, fulfillment: null }).expect(200),
    );

    // 12 × 1,00 € = 12,00 € à 5,5 % ; 4 × 3,00 € = 12,00 € à 10 %.
    expect(view.subtotalHtCents).toBe(2_400);
    expect(view.vat).toEqual([
      { rate: 5.5, amountCents: 66 },
      { rate: 10, amountCents: 120 },
    ]);
    expect(view.totalCents).toBe(2_586);
  });

  /**
   * Régression : le panier faisait `prix × quantité` dans le navigateur, ce que
   * `architecture-prix-boutique.md` §6 interdit noir sur blanc. Le total de
   * ligne est un MONTANT, arrondi une fois — c'est le serveur qui le rend.
   */
  it("rend le total de ligne, arrondi UNE fois, plutôt que de le laisser au front", async () => {
    await seedCatalogue();

    const view = jsonBody<ShopQuoteView>(
      await quote({ lines: [{ sku: "VIE-001", quantity: 12 }], fulfillment: null }).expect(200),
    );

    expect(view.lines).toEqual([
      {
        sku: "VIE-001",
        quantity: 12,
        unitPriceMillicents: 100_000,
        lineTotalCents: 1_200,
        vatRatePercent: 5.5,
      },
    ]);
  });

  it("retranche la remise du point de retrait AU PRORATA de chaque taux", async () => {
    await seedCatalogue();
    const point = await seedPickup("percent", 1_000);

    const view = jsonBody<ShopQuoteView>(
      await quote({
        lines: PANIER,
        fulfillment: { method: "pickup", pickupAddressId: point },
      }).expect(200),
    );

    expect(view.discountCents).toBe(240);
    // Chaque assiette perd 10 % : 10,80 € à 5,5 % et 10,80 € à 10 %.
    expect(view.vat).toEqual([
      { rate: 5.5, amountCents: 59 },
      { rate: 10, amountCents: 108 },
    ]);
    expect(view.totalCents).toBe(2_327);
  });

  /**
   * 🔴 Ce que le front ne savait PAS représenter : `ServiceChoice.discount` était
   * un pourcentage, et une remise en montant s'y affichait à 0 % pendant que la
   * commande la déduisait. Le serveur rend l'ajustement, pas un libellé.
   */
  it("sert une remise en MONTANT, que le front ne savait pas dire", async () => {
    await seedCatalogue();
    const point = await seedPickup("amount", 500);

    const view = jsonBody<ShopQuoteView>(
      await quote({
        lines: PANIER,
        fulfillment: { method: "pickup", pickupAddressId: point },
      }).expect(200),
    );

    expect(view.discountCents).toBe(500);
    expect(view.discountAdjustment).toEqual({ mode: "amount", cents: 500 });
  });

  it("taxe le coursier, HORS remise, au taux du transport", async () => {
    await seedCatalogue();
    await seedZone();

    const view = jsonBody<ShopQuoteView>(
      await quote({
        lines: PANIER,
        fulfillment: { method: "delivery", codePostal: "73150" },
      }).expect(200),
    );

    expect(view.deliveryFeeCents).toBe(2_000);
    expect(view.discountCents).toBe(0);
    // La ligne à 20 % est celle du transport, et elle n'existait pas au panier :
    // le coursier n'était pas taxé, d'où quatre euros d'écart sur vingt.
    expect(view.vat).toContainEqual({ rate: 20, amountCents: 400 });
    expect(view.totalCents).toBe(2_400 + 2_000 + 586);
  });

  /**
   * **409 et non 400** : « on ne livre pas là » est un refus MÉTIER, pas une
   * requête mal formée. C'est la même erreur que la caisse oppose, par le même
   * service — un devis qui accepterait ce que la commande refuse ne servirait
   * qu'à faire découvrir le refus plus tard.
   */
  it("refuse un code postal qu'on ne livre pas, au lieu de chiffrer un panier impossible", async () => {
    await seedCatalogue();
    await seedZone();

    const response = await quote({
      lines: PANIER,
      fulfillment: { method: "delivery", codePostal: "99000" },
    }).expect(409);

    expect((response.body as { code?: string }).code).toBe("orders.delivery_zone.not_served");
  });

  /**
   * Le décompte sans acheminement n'est pas une approximation : c'est
   * exactement ce que coûtent les marchandises. La boutique laisse composer un
   * panier avant d'avoir dit où l'on est servi.
   */
  it("chiffre les marchandises seules tant qu'aucun service n'est choisi", async () => {
    await seedCatalogue();

    const view = jsonBody<ShopQuoteView>(
      await quote({ lines: PANIER, fulfillment: null }).expect(200),
    );

    expect(view.discountCents).toBe(0);
    expect(view.discountAdjustment).toBeNull();
    expect(view.deliveryFeeCents).toBe(0);
  });

  /**
   * 🔴 Le test qui garde la frontière. La réponse est servie sans jeton : tout
   * champ ajouté est public le jour du déploiement. Énumérer les clés attrape ce
   * qu'une assertion ciblée laisserait passer.
   */
  it("ne laisse RIEN franchir de la machinerie qui fabrique le prix", async () => {
    await seedCatalogue();

    const view = jsonBody<ShopQuoteView>(
      await quote({ lines: PANIER, fulfillment: null }).expect(200),
    );

    expect(Object.keys(view).sort()).toEqual([
      "deliveryFeeCents",
      "discountAdjustment",
      "discountCents",
      "lines",
      "subtotalHtCents",
      "totalCents",
      "vat",
    ]);
    for (const line of view.lines) {
      expect(Object.keys(line).sort()).toEqual([
        "lineTotalCents",
        "quantity",
        "sku",
        "unitPriceMillicents",
        "vatRatePercent",
      ]);
    }
  });

  /**
   * Un SKU inconnu et un panier mal formé rendent tous deux 400 : le premier est
   * une `DomainError`, le second un refus de schéma. On distingue donc par le
   * CODE — sans quoi ce test passerait le jour où la route casse pour une tout
   * autre raison.
   */
  it("refuse un SKU que le catalogue ne connaît pas", async () => {
    await seedCatalogue();

    const response = await quote({
      lines: [{ sku: "INCONNU", quantity: 1 }],
      fulfillment: null,
    }).expect(400);

    expect((response.body as { code?: string }).code).toBe("orders.sku.unknown");
  });

  it("borne le panier — une surface anonyme qui résout des prix se plafonne", async () => {
    await seedCatalogue();

    await quote({
      lines: Array.from({ length: 101 }, () => ({ sku: "VIE-001", quantity: 1 })),
      fulfillment: null,
    }).expect(400);
  });
});
