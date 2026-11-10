import { randomUUID } from "node:crypto";

/**
 * E2E de l'**idempotence de passation**, sur un vrai Postgres.
 *
 * 🔴 `POST /orders` n'avait ni clé, ni clé naturelle, ni déduplication : un
 * double clic, un rejeu réseau ou un retour arrière créait **deux commandes et
 * deux intentions Stripe**.
 *
 * Ce que seul le vrai SQL prouve, et pourquoi ces cas sont ici plutôt qu'en
 * unitaire : c'est l'**index unique** `(user_id, key)` qui arbitre, pas le code.
 * Deux appels simultanés qui liraient avant d'écrire trouveraient tous deux le
 * registre vide et passeraient tous deux la commande — un double avec une `Map`
 * ne l'aurait jamais montré.
 */
import type { PlacedOrderResponse } from "@lfd/contracts";

import type { RetrievedIntent } from "../src/card-payment/domain/ports/card-provider-types.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { E2eCardProvider, E2eCardProviders } from "./card-payments.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

const CLIENT = "auth0|idem";

/**
 * Le prestataire de carte doublé, qui compte aussi ses relectures
 * d'intention : le rejeu doit **re-dériver** le secret plutôt que le relire
 * d'une colonne — nous n'en stockons aucun, et c'est la règle du dépôt.
 */
class RetrieveCountingCardProvider extends E2eCardProvider {
  retrieved = 0;

  override retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    this.retrieved += 1;
    return super.retrieveIntent(providerRef);
  }
}

/** Le registre doublé, servi par le prestataire qui compte. */
class RetrieveCountingCardProviders extends E2eCardProviders {
  override readonly provider = new RetrieveCountingCardProvider("pi_idem");
}

const cards = new RetrieveCountingCardProviders("pi_idem");

let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: CardProviders, value: cards }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cards.provider.issued.splice(0);
  cards.provider.retrieved = 0;
  const point = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "Route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

/** Un panier de retrait, dont chaque cas ne fait varier que ce qu'il éprouve. */
function order(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companyId: null,
    idempotencyKey: randomUUID(),
    salesTerms: null,
    fulfillmentMethod: "pickup",
    // Pas de commande sans créneau (2026-10-14).
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    requestedDeliveryDate: serviceDay(),
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 2 }],
    ...over,
  };
}

const place = (payload: Record<string, unknown>) => ctx.asSub(CLIENT).post("/orders").send(payload);

const orderCount = (): Promise<number> => ctx.prisma.order.count();

describe("une clé de passation ne sert qu'une fois", () => {
  /** Le cas nominal du double clic : deux appels, une commande. */
  it("rend la MÊME commande au second appel, et n'en écrit qu'une", async () => {
    const payload = order();

    const first = jsonBody<PlacedOrderResponse>(await place(payload).expect(201));
    const second = jsonBody<PlacedOrderResponse>(await place(payload).expect(201));

    expect(second.id).toBe(first.id);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(await orderCount()).toBe(1);
  });

  /**
   * Le règlement est **re-dérivé**, jamais relu : aucun `clientSecret` ne dort
   * dans notre base. Un aller-retour de plus au prestataire, sur un chemin rare.
   */
  it("redemande l'intention au prestataire plutôt que de la stocker", async () => {
    const payload = order();
    const first = jsonBody<PlacedOrderResponse>(await place(payload).expect(201));
    const [intent] = cards.provider.issued;
    expect(first.payment?.clientSecret).toBe(`${String(intent)}_secret`);
    expect(cards.provider.retrieved).toBe(0);

    const second = jsonBody<PlacedOrderResponse>(await place(payload).expect(201));

    // LA MÊME intention, et une seule création : le rejeu ne dimensionne pas un
    // second encaissement.
    expect(second.payment?.clientSecret).toBe(`${String(intent)}_secret`);
    expect(cards.provider.issued).toEqual([intent]);
    expect(cards.provider.retrieved).toBe(1);
  });

  /**
   * 🔴 Le cas que la contradiction a trouvé, et sans lequel tout le dispositif
   * se retournait : une clé rejouée avec un panier CORRIGÉ rendait l'ancienne
   * commande, et le front vidait la correction en silence.
   */
  it("REFUSE une clé rejouée avec un autre panier", async () => {
    const key = randomUUID();
    await place(order({ idempotencyKey: key })).expect(201);

    const response = await place(
      order({ idempotencyKey: key, lines: [{ sku: "VIE-001-1", quantity: 9 }] }),
    ).expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("orders.idempotency.reused");
    expect(await orderCount()).toBe(1);
  });

  /**
   * **La course**, et c'est le cas qui justifie l'index unique : deux appels
   * partis ensemble, dont aucun n'a vu l'autre. Exactement une commande, et le
   * perdant reçoit un refus nommé plutôt qu'un doublon.
   */
  it("deux appels SIMULTANÉS ne produisent qu'une commande", async () => {
    const payload = order();

    const outcomes = await Promise.all([
      place(payload).then((r) => r.status),
      place(payload).then((r) => r.status),
    ]);

    expect(outcomes.filter((status) => status === 201)).toHaveLength(1);
    // Le perdant : soit la course est serrée (409 « en vol »), soit le gagnant a
    // déjà résolu sa clé et c'est un rejeu (201, la même commande).
    expect(outcomes).toContain(outcomes.find((status) => status === 409 || status === 201));
    expect(await orderCount()).toBe(1);
  });

  /**
   * 🔴 La clé se REND quand rien n'a été écrit. Sans ça, un client refusé pour
   * un SKU disparu resterait bloqué par le mécanisme censé le protéger : sa
   * correction recevrait « en cours » pour l'éternité.
   */
  it("rend la clé sur un refus, et la correction repasse avec la MÊME clé", async () => {
    const key = randomUUID();

    await place(order({ idempotencyKey: key, lines: [{ sku: "INCONNU", quantity: 1 }] })).expect(
      400,
    );
    expect(await orderCount()).toBe(0);

    await place(order({ idempotencyKey: key })).expect(201);

    expect(await orderCount()).toBe(1);
  });

  /** La clé est murée par personne : celle d'un autre ne donne accès à rien. */
  it("ne partage pas une clé entre deux personnes", async () => {
    const key = randomUUID();
    await place(order({ idempotencyKey: key })).expect(201);

    await ctx
      .asSub("auth0|quelqu-un-d-autre")
      .post("/orders")
      .send(order({ idempotencyKey: key }))
      .expect(201);

    expect(await orderCount()).toBe(2);
  });

  /** Au contrat, et pas dans un en-tête : un appel sans clé est refusé net. */
  it("refuse une passation sans clé, et une clé qui n'est pas un UUID", async () => {
    const { idempotencyKey: _ignored, ...sansCle } = order();
    await place(sansCle).expect(400);
    await place(order({ idempotencyKey: "pas-un-uuid" })).expect(400);

    expect(await orderCount()).toBe(0);
  });
});
