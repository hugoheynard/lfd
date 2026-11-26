import { FixedRecipients } from "../../commands/__tests__/intake-doubles.js";
import {
  orderCardChannelOf,
  orderCardLabel,
  orderCardMetadata,
  orderCardPayer,
} from "../order-card-label.js";

const PAYER = { userId: "usr_1", name: "Jeanne Martin", email: "jeanne@example.test" };

describe("orderCardLabel — ce que le prestataire montre d'une commande (D3)", () => {
  it("à la passation : ni numéro ni identifiant, ils naissent à l'écriture", () => {
    expect(
      orderCardLabel({
        channel: "shop",
        kind: "first",
        orderId: null,
        orderNumber: null,
        payer: PAYER,
      }),
    ).toEqual({
      description: "LFD · La Folie Coffee boutique · paiement",
      metadata: { app: "la-folie-coffee", channel: "shop", kind: "first" },
      payer: PAYER,
    });
  });

  it("un complément : le numéro dans la description, la commande en métadonnées", () => {
    expect(
      orderCardLabel({
        channel: "pro",
        kind: "complement",
        orderId: "ord_1",
        orderNumber: "2026-01234",
        payer: null,
      }),
    ).toEqual({
      description: "LFD · La Folie Coffee pro · Commande n° 2026-01234 · complément",
      metadata: {
        app: "la-folie-coffee",
        channel: "pro",
        kind: "complement",
        subject_id: "ord_1",
        order_number: "2026-01234",
      },
    });
  });

  it("la saisie staff se dit en toutes lettres", () => {
    expect(
      orderCardLabel({
        channel: "staff",
        kind: "first",
        orderId: null,
        orderNumber: null,
        payer: null,
      }).description,
    ).toBe("LFD · La Folie Coffee saisie staff · paiement");
  });

  it("le canal d'un acheteur connecté : pro pour une société, boutique sinon", () => {
    expect(orderCardChannelOf("cmp_1")).toBe("pro");
    expect(orderCardChannelOf(null)).toBe("shop");
  });

  it("les clés d'un remboursement : l'application et le numéro lisible", () => {
    expect(orderCardMetadata("2026-01234")).toEqual({
      app: "la-folie-coffee",
      order_number: "2026-01234",
    });
  });
});

describe("orderCardPayer — le payeur lu à l'annuaire", () => {
  it("rend son nom et son adresse", async () => {
    await expect(
      orderCardPayer(new FixedRecipients({ usr_1: "jeanne@example.test" }), "usr_1"),
    ).resolves.toEqual({ userId: "usr_1", name: "Client", email: "jeanne@example.test" });
  });

  it("introuvable : aucun payeur, l'intention partira sans client", async () => {
    await expect(orderCardPayer(new FixedRecipients(), "usr_x")).resolves.toBeNull();
  });
});
