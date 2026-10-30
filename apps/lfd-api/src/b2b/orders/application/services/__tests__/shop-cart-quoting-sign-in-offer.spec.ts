import type { ShopQuoteFulfillment } from "@lfd/contracts";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { guestSignInOffer } from "./basket-promotions.doubles.js";
import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * « Vous avez un compte ? Connectez-vous pour profiter de −20 % » (plan des
 * promotions, § 8, lot L10) : le devis ANONYME le dit quand une promotion
 * réservée aux inscrits toucherait le panier — jamais un devis reconnu, et
 * jamais sous l'ancien chemin.
 */
const CATALOG = [catalogItem("PAI-001", "Baguette", 100_000, 5.5)];
const CLASSIFIED = {
  "PAI-001": {
    productId: "p_pain",
    categoryId: "c_pains",
    categoryPath: ["c_pains"],
    madeToOrder: false,
  },
};
const INSCRITS = livePromotion({
  id: "inscrits",
  audience: { kind: "individuals_registered" },
  validFrom: new Date(Date.UTC(2020, 0, 1)),
});
const PAYLOAD = { lines: [{ sku: "PAI-001", quantity: 2 }], fulfillment: null };

function quoting() {
  return quotingOf({
    catalog: CATALOG,
    classified: CLASSIFIED,
    signIn: guestSignInOffer({ line: [INSCRITS] }, new FixedLineClassifications(CLASSIFIED)),
  });
}

describe("ShopCartQuoting — ce qu'une connexion ouvrirait (L10)", () => {
  it("le dit au devis anonyme, sans rien appliquer", async () => {
    const { view } = await quoting().quote({
      payload: PAYLOAD,
      companyId: null,
      buyerUserId: null,
    });

    expect(view.signInOffer).toEqual({ effect: { kind: "percent", basisPoints: 2_000 } });
  });

  it("ne le dit pas à un devis reconnu", async () => {
    const { view } = await quoting().quote({
      payload: PAYLOAD,
      companyId: null,
      buyerUserId: "usr_1",
    });

    expect(view).not.toHaveProperty("signInOffer");
  });
});

/**
 * « Seulement si une ligne est touchée » : l'offre ne se dit pas à vide. Un
 * invité à qui l'on promet −20 % sur ce qu'il n'a pas dans son panier a été
 * trompé.
 */
describe("GuestSignInOffer — seulement ce qu'une connexion ouvrirait vraiment", () => {
  const WINDOW = { validFrom: new Date(Date.UTC(2020, 0, 1)) };
  const only = (categoryId: string) =>
    ({
      mode: "only",
      rules: [{ target: "category", targetId: categoryId, eligible: true, targetRank: null }],
    }) as const;

  function ask(
    promotions: Parameters<typeof guestSignInOffer>[0],
    over: {
      readonly companyId?: string | null;
      readonly buyerUserId?: string | null;
      readonly fulfillment?: ShopQuoteFulfillment | null;
      readonly lines?: readonly { sku: string }[];
    } = {},
  ) {
    return guestSignInOffer(promotions, new FixedLineClassifications(CLASSIFIED)).offerFor(
      {
        companyId: over.companyId ?? null,
        buyerUserId: over.buyerUserId ?? null,
        payload: { fulfillment: over.fulfillment ?? null },
      },
      (over.lines ?? [{ sku: "PAI-001" }]).map(({ sku }) => ({
        line: { sku, saleUnit: "piece" as const },
      })),
    );
  }

  const registered = (over: Parameters<typeof livePromotion>[0] = {}) =>
    livePromotion({ ...WINDOW, audience: { kind: "individuals_registered" }, ...over });

  it("ne dit rien quand la portée ne touche aucune ligne du panier", async () => {
    const boissons = registered({ id: "boissons", scope: only("c_boissons") });

    expect(await ask({ line: [boissons] })).toBeUndefined();
  });

  it("le dit dès qu'UNE ligne sur plusieurs est touchée", async () => {
    const pains = registered({ id: "pains", scope: only("c_pains") });

    const offered = await ask(
      { line: [pains] },
      { lines: [{ sku: "PAI-001" }, { sku: "BOI-001" }] },
    );

    expect(offered).toEqual({ effect: { kind: "percent", basisPoints: 2_000 } });
  });

  it("ne dit rien d'une promotion que l'invité a déjà (public « tout le monde »)", async () => {
    expect(await ask({ line: [livePromotion({ ...WINDOW })] })).toBeUndefined();
  });

  it("ne dit rien d'une promotion réservée aux invités eux-mêmes", async () => {
    const guests = livePromotion({ ...WINDOW, audience: { kind: "individuals_guest" } });

    expect(await ask({ line: [guests] })).toBeUndefined();
  });

  it("ne dit rien d'une promotion hors fenêtre, ni en pause", async () => {
    const later = registered({ validFrom: new Date(Date.UTC(2999, 0, 1)) });
    const ended = registered({ validTo: new Date(Date.UTC(2021, 0, 1)) });
    const paused = registered({ suspendedFrom: new Date(Date.UTC(2021, 0, 1)) });

    expect(await ask({ line: [later, ended, paused] })).toBeUndefined();
  });

  it("n'est servi ni à un devis reconnu, ni à un devis de société", async () => {
    const promo = registered();

    expect(await ask({ line: [promo] }, { buyerUserId: "usr_1" })).toBeUndefined();
    expect(await ask({ line: [promo] }, { companyId: "co_1" })).toBeUndefined();
  });

  it("ne dit rien d'un panier vide de lignes tarifées", async () => {
    expect(await ask({ line: [registered()] }, { lines: [] })).toBeUndefined();
  });

  // Une promotion de PANIER « inscrits » compte comme une de ligne — mais son
  // acheminement, une fois choisi, doit l'admettre. Inconnu, il n'écarte rien.
  it("lit aussi le point panier, et l'acheminement choisi l'écarte s'il ne l'admet pas", async () => {
    const delivery = registered({ id: "livr", fulfillment: { kind: "delivery" } });

    expect(await ask({ basket: [delivery] })).toEqual({
      effect: { kind: "percent", basisPoints: 2_000 },
    });
    expect(
      await ask(
        { basket: [delivery] },
        { fulfillment: { method: "delivery", codePostal: "73000" } },
      ),
    ).toEqual({ effect: { kind: "percent", basisPoints: 2_000 } });
    expect(
      await ask(
        { basket: [delivery] },
        { fulfillment: { method: "pickup", pickupAddressId: "pk_1" } },
      ),
    ).toBeUndefined();
  });

  it("une promotion au point précis ne s'offre pas à un autre point", async () => {
    const atCoeur = registered({
      fulfillment: { kind: "pickup_point", pickupId: "pk_coeur" },
    });

    expect(
      await ask(
        { basket: [atCoeur] },
        { fulfillment: { method: "pickup", pickupAddressId: "pk_coeur" } },
      ),
    ).toBeDefined();
    expect(
      await ask(
        { basket: [atCoeur] },
        { fulfillment: { method: "pickup", pickupAddressId: "pk_autre" } },
      ),
    ).toBeUndefined();
  });

  it("dit la plus forte : un pourcentage de 30 % bat 20 %, quel que soit le point de lecture", async () => {
    const weak = registered({ id: "a_weak" });
    const strong = registered({
      id: "z_strong",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 3_000 },
    });

    expect(await ask({ line: [weak], basket: [strong] })).toEqual({
      effect: { kind: "percent", basisPoints: 3_000 },
    });
  });
});
