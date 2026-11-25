import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import {
  BOOK_ADDRESS_ID,
  content,
  NOW,
  placedOrder,
  revisingAt,
  reviseScene,
} from "./revision-scene.js";

/**
 * **La révision relit le port offert** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, décisions 14
 * et 16) : une commande issue d'un reliquat garde un port nul dans toute zone,
 * et le devis de la révision dit la même chose que la révision.
 */
const STAFF = { kind: "staff", staffId: "stf_1" } as const;

/** Le retrait du Labo devient une livraison dans la zone à 5 € forfaitaires. */
const TO_DELIVERY = {
  fulfillmentMethod: "delivery",
  pickupAddressId: null,
  requestedWindow: { start: null, end: "10:00" },
  deliveryAddressId: BOOK_ADDRESS_ID,
  deliveryAddress: {
    label: "",
    ligne1: "2 rue Neuve",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
  },
} as const;

/** Sans remise de point : la règle L9 n'a rien à refuser au passage en livraison. */
const NO_DISCOUNT = { discountAdjustment: null, discountCents: 0 } as const;

describe("OrderRevising — le port offert d'une commande issue d'un reliquat", () => {
  // Posé même en retrait (décision 16) : la commande transformée en retrait,
  // révisée vers une livraison en zone à frais, ne paie pas de port.
  it("retrait révisé vers une livraison en zone à frais : port nul, drapeau conservé", async () => {
    const order = await placedOrder({ ...NO_DISCOUNT, deliveryOffered: true });

    const { revision } = await revisingAt(new FixedClock(NOW)).compose(
      order,
      content(TO_DELIVERY),
      STAFF,
      { requireChange: true, decidedAt: NOW },
    );

    expect(revision.state.deliveryFeeCents).toBe(0);
    expect(revision.state.deliveryOffered).toBe(true);
    expect(revision.state.freeDelivery?.waivedCents).toBe(500);
  });

  it("la même commande SANS le drapeau paie le port de la zone (la passation ordinaire est inchangée)", async () => {
    const order = await placedOrder({ ...NO_DISCOUNT, deliveryOffered: false });

    const { revision } = await revisingAt(new FixedClock(NOW)).compose(
      order,
      content(TO_DELIVERY),
      STAFF,
      { requireChange: true, decidedAt: NOW },
    );

    expect(revision.state.deliveryFeeCents).toBe(500);
    expect(revision.state.deliveryOffered).toBe(false);
  });

  // Le devis et la révision lisent la même colonne : deux lectures, un total.
  it("le devis (sans exiger de changement) rend le même port que la révision", async () => {
    const order = await placedOrder({ ...NO_DISCOUNT, deliveryOffered: true });
    const revising = revisingAt(new FixedClock(NOW));

    const quoted = await revising.compose(order, content(TO_DELIVERY), STAFF, {
      requireChange: false,
      decidedAt: NOW,
    });
    const revised = await revising.compose(order, content(TO_DELIVERY), STAFF, {
      requireChange: true,
      decidedAt: NOW,
    });

    expect(quoted.revision.state.deliveryFeeCents).toBe(0);
    expect(quoted.revision.state.totalCents).toBe(revised.revision.state.totalCents);
  });

  it("une commande au port offert qui reste en retrait garde le drapeau", async () => {
    const order = await placedOrder({ deliveryOffered: true });

    const { revision } = await revisingAt(new FixedClock(NOW)).compose(
      order,
      content({ note: "x" }),
      STAFF,
      { requireChange: true, decidedAt: NOW },
    );

    expect(revision.state.deliveryOffered).toBe(true);
    expect(revision.state.deliveryFeeCents).toBe(0);
  });

  it("le handler enregistre la révision au port nul", async () => {
    const order = await placedOrder({ ...NO_DISCOUNT, deliveryOffered: true });
    const { handler, asSeen, revisions } = reviseScene(order);

    await handler.execute(await asSeen("ord_1", STAFF, 0, content(TO_DELIVERY)));

    expect(revisions.saved[0]?.revision.state).toMatchObject({
      deliveryFeeCents: 0,
      deliveryOffered: true,
    });
  });
});
