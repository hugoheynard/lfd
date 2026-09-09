import { toCustomerOrder } from "../order.js";
import type { OrderView } from "../order.js";

/**
 * **Le mur entre la commande du comptoir et celle du client.**
 *
 * `POST /orders/quote` était rétrécie depuis le 2026-09-09 ; `GET /orders/mine`,
 * `GET /orders/:id` et `GET /companies/:id/orders` ne l'étaient pas, et
 * servaient la trace figée **entière** — l'identifiant de chaque règle, nos
 * étages, et `floorDecision`, c'est-à-dire la marge avec les preuves qui l'ont
 * ouverte (R27).
 *
 * Ces cas portent sur les **CLÉS**, jamais sur des absences une à une : un champ
 * ajouté demain à la vue staff passerait entre les mailles d'une liste
 * d'absences, il ne passe pas entre celles d'un jeu de clés exact.
 *
 * ⚠️ Les dates de la fixture sont absolues, et c'est le cas prévu par
 * l'exception : `toCustomerOrder` ne les compare à rien, surtout pas à
 * l'horloge — il les recopie.
 */
const STAFF_ORDER: OrderView = {
  id: "ord_1",
  orderNumber: "C-2026-0001",
  status: "confirmed",
  paymentStatus: "paid",
  requestedDeliveryDate: "2026-03-02",
  fulfillmentMethod: "pickup",
  deliveryAddressId: null,
  deliveryAddress: null,
  pickupAddress: null,
  fulfillment: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  note: "",
  subtotalCents: 2_160,
  discountCents: 0,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  deliveryFeeAdjustment: null,
  lateFeeCents: 0,
  lateFeeAdjustment: null,
  vatCents: 118,
  vatShares: null,
  totalCents: 2_278,
  currency: "EUR",
  customerLabel: "Hôtel des Cimes",
  companyId: "cmp_1",
  fromSubscriptionId: null,
  origin: "self_service",
  placedByStaffId: null,
  recurringDeltas: null,
  placedAt: "2026-03-01T08:00:00.000Z",
  lines: [
    {
      sku: "VIE-001",
      productName: "Croissant",
      unitPriceMillicents: 180_000,
      vatRate: 5.5,
      quantity: 12,
      lineTotalCents: 2_160,
      pricing: {
        basePriceMillicents: 200_000,
        steps: [
          {
            stage: "promotion",
            ruleId: "promo_hiver",
            label: "Promotion d'hiver",
            scope: null,
            resultMillicents: 180_000,
            supersedes: [{ ruleId: "promo_gc", label: "Promo grands comptes −20 %" }],
          },
        ],
        floored: true,
        clampedToZero: false,
        floorDecision: {
          tier: "hard",
          floorMillicents: 150_000,
          observedVolumeRatioBp: null,
          quantityMet: true,
          volumeMet: false,
        },
        commitment: {
          commitmentId: "eng_1",
          promisedQuantity: 10_000,
          cumulativeQuantity: 1_200,
          retainedQuantity: 10_000,
        },
      },
      allergens: null,
    },
  ],
  handoverToken: "tok_1",
  confirmedAt: "2026-03-01T09:00:00.000Z",
  readyAt: null,
  handedOverAt: null,
};

describe("toCustomerOrder", () => {
  it("ne laisse de la trace que ce qui explique le prix payé", () => {
    const trace = toCustomerOrder(STAFF_ORDER).lines[0]?.pricing;

    expect(Object.keys(trace ?? {}).sort()).toEqual(["basePriceMillicents", "floored", "steps"]);
  });

  /**
   * Le même fait, dit par les noms : quand ce test rougit, le message nomme le
   * champ qui fuit au lieu de montrer deux listes à comparer à l'œil.
   */
  it.each([
    // La clé de nos règles, et le nom de nos étages.
    "ruleId",
    "stage",
    "scope",
    // Le prix intermédiaire de chaque passe.
    "resultMillicents",
    // 🔴 Le libellé commercial des promotions que ce client n'a PAS eues.
    "supersedes",
  ])("ne rend pas « %s » sur un étage", (field) => {
    expect(toCustomerOrder(STAFF_ORDER).lines[0]?.pricing?.steps[0]).not.toHaveProperty(field);
  });

  it.each([
    // 🔴 Le plancher, c'est-à-dire la marge, et les preuves qui l'ont ouvert.
    "floorDecision",
    // Un fait de moteur : la chaîne est passée sous zéro.
    "clampedToZero",
    // Les chiffres du client lui-même — mais aucun écran ne les lit, et
    // l'engagement de volume n'a pas d'écran du tout (R6).
    "commitment",
  ])("ne rend pas « %s » sur la trace", (field) => {
    expect(toCustomerOrder(STAFF_ORDER).lines[0]?.pricing).not.toHaveProperty(field);
  });

  it("garde le libellé de chaque étage, le tarif d'entrée et la pastille de plancher", () => {
    // Rétrécir n'est utile que si le client garde de quoi comprendre sa facture :
    // ce qu'il a payé, ce que ça valait au rayon, et pourquoi l'écart.
    const trace = toCustomerOrder(STAFF_ORDER).lines[0]?.pricing;

    expect(trace).toEqual({
      basePriceMillicents: 200_000,
      steps: [{ label: "Promotion d'hiver" }],
      floored: true,
    });
  });

  it("recopie le reste de la commande à l'identique", () => {
    // Le premier niveau n'a jamais été le sujet : chacun de ses champs a été
    // décidé pour le client. Ce cas fige ce jeu de clés — un champ staff ajouté
    // demain au mapper le fait rougir, ce qui est tout ce qu'on lui demande.
    const order = toCustomerOrder(STAFF_ORDER);

    expect(Object.keys(order).sort()).toEqual(Object.keys(STAFF_ORDER).sort());
    expect(order.totalCents).toBe(2_278);
    expect(order.lines[0]?.lineTotalCents).toBe(2_160);
  });
});
