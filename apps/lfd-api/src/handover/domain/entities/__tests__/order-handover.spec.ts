import type { HandoverSubject } from "../../../channels/commerce/handover-subject.reader.js";
import { HandoverRefusedError } from "../../errors/handover-errors.js";
import { ShipmentRef } from "../../../../production/channels/handover/index.js";
import { OrderHandover } from "../order-handover.js";

/**
 * L'agrégat de l'attestation : ce qu'il refuse de laisser exister.
 *
 * Il n'y a rien à tester sur ce qu'il accepte au-delà d'un cas — c'est une ligne
 * de cinq colonnes. Tout l'intérêt est dans les trois refus, qui étaient
 * auparavant dans deux handlers, écrits deux fois.
 */

const AT = new Date("2026-09-07T16:30:00.000Z");

/** Un reste colisé : son bac est fermé, le BL du rang 2 préparé (plan E7 reliquat, L4c). */
function withPackedRest(): HandoverSubject {
  return subject({ laterShipments: [{ rank: 2, prepared: true, lines: [] }] });
}

/** Ni attestation déjà gravée, ni retenue qualité. */
const FREE = { handedOverAt: null, qualityHold: false } as const;

function subject(overrides: Partial<HandoverSubject> = {}): HandoverSubject {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-ABCD-1234",
    placedByUserId: "usr_1",
    customerLabel: "Les Halles",
    placedAt: new Date("2026-09-06T08:00:00.000Z"),
    requestedDeliveryDate: null,
    pickupLabel: "Le labo",
    status: "ready",
    settled: true,
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 2, saleUnit: "piece" }],
    laterShipments: [],
    ...overrides,
  };
}

describe("OrderHandover.attest", () => {
  it("grave la référence et l'auteur du sujet, pas de la charge utile", () => {
    const handover = OrderHandover.attest(subject(), 1, FREE, AT, "staff-1", "scan");

    expect(handover.orderId).toBe("ord_1");
    expect(handover.reference).toBe("ORD-ABCD-1234");
    expect(handover.handedOverAt).toBe(AT);
    expect(handover.handedOverBy).toBe("staff-1");
    expect(handover.via).toBe("scan");
  });

  it("refuse une commande annulée en NOMMANT le cas", () => {
    expect(() =>
      OrderHandover.attest(subject({ status: "cancelled" }), 1, FREE, AT, "staff-1", "scan"),
    ).toThrow(HandoverRefusedError);
  });

  /**
   * Régression : une carte « À régler » se remettait au comptoir — la règle ne
   * lisait pas le règlement (constaté en production le 2026-10-09).
   */
  it("refuse une commande NON RÉGLÉE en nommant le cas", () => {
    expect(() =>
      OrderHandover.attest(subject({ settled: false }), 1, FREE, AT, "staff-1", "scan"),
    ).toThrow(/n'est pas réglée/);
  });

  it("refuse quand le fournil tient DÉJÀ une attestation", () => {
    // La deuxième ligne d'attestation est impossible en base ; celle-ci est la
    // garde amont, qui rend un refus lisible au lieu d'une violation d'index.
    expect(() =>
      OrderHandover.attest(
        subject(),
        1,
        { handedOverAt: new Date("2026-09-07T15:00:00.000Z"), qualityHold: false },
        AT,
        "staff-1",
        "scan",
      ),
    ).toThrow(/déjà été retirée/u);
  });

  it("refuse une commande RETENUE au contrôle qualité, sans en dire le motif", () => {
    // Le geste — scan, saisie, coursier — passe tout entier par ici : c'est
    // l'endroit où la retenue doit refuser (plan-controle-qualite.md, D4).
    expect(() =>
      OrderHandover.attest(
        subject(),
        1,
        { handedOverAt: null, qualityHold: true },
        AT,
        "staff-1",
        "scan",
      ),
    ).toThrow("Commande en cours de vérification.");
  });

  it("dit « déjà retirée », pas « en vérification », pour un sac parti puis retenu", () => {
    expect(() =>
      OrderHandover.attest(
        subject(),
        1,
        { handedOverAt: new Date("2026-09-07T15:00:00.000Z"), qualityHold: true },
        AT,
        "staff-1",
        "scan",
      ),
    ).toThrow(/déjà été retirée/u);
  });

  it("refuse une attestation SANS AUTEUR", () => {
    // Une preuve sans auteur n'est pas une preuve. Le contrôleur le refuse déjà ;
    // l'agrégat le refuse aussi, pour le jour où un second appelant existera.
    expect(() => OrderHandover.attest(subject(), 1, FREE, AT, "", "manual")).toThrow(
      HandoverRefusedError,
    );
  });

  it("n'applique AUCUNE règle en réhydratant une attestation déjà gravée", () => {
    // La règle dit ce qu'on a le droit de faire, pas ce qui a eu lieu. Une
    // commande annulée après son retrait doit rester lisible — c'est précisément
    // le jour où on va relire l'attestation qui prouve qu'elle est partie.
    const rehydrated = OrderHandover.rehydrate("ord_1", "ORD-ABCD-1234", AT, "staff-1", "manual");

    expect(rehydrated.via).toBe("manual");
    expect(rehydrated.handedOverAt).toBe(AT);
  });
});

describe("OrderHandover — le rang de l'envoi (plan E7 reliquat, L3d)", () => {
  it("au rang 1, attest grave la commande elle-même, sous son numéro, à l'identique", () => {
    const handover = OrderHandover.attest(subject(), 1, FREE, AT, "staff-1", "scan");

    expect(handover.rank).toBe(1);
    expect(handover.reference).toBe("ORD-ABCD-1234");
  });

  it("au rang 2, attest grave le reliquat, sa référence suffixée -2 (L4b)", () => {
    const handover = OrderHandover.attest(withPackedRest(), 2, FREE, AT, "staff-1", "scan");

    expect(handover.rank).toBe(2);
    expect(handover.reference).toBe("ORD-ABCD-1234-2");
    expect(handover.shipment.equals(ShipmentRef.of("ord_1", 2))).toBe(true);
  });

  it("« déjà retiré » se juge par envoi : le refus nomme le reliquat", () => {
    expect(() =>
      OrderHandover.attest(subject(), 2, { handedOverAt: AT, qualityHold: false }, AT, "s", "scan"),
    ).toThrow("Le reste de cette commande (envoi 2) a déjà été retiré.");
  });

  it("refuse un reste dont le bac n'est pas fermé, ou qu'aucun bon ne porte (L4c)", () => {
    const planned = subject({ laterShipments: [{ rank: 2, prepared: false, lines: [] }] });

    for (const [candidate, rank] of [
      [planned, 2],
      [subject(), 2],
    ] as const) {
      expect(() => OrderHandover.attest(candidate, rank, FREE, AT, "staff-1", "scan")).toThrow(
        `Le reste de cette commande (envoi ${String(rank)}) n'est pas prêt`,
      );
    }
  });

  it("refuse un rang hors forme : un envoi de rang 0 n'existe pas", () => {
    expect(() => OrderHandover.attest(subject(), 0, FREE, AT, "staff-1", "scan")).toThrow(/rang/u);
  });

  it("rehydrate relit le rang de la ligne, et le rang 1 quand on ne le dit pas", () => {
    expect(OrderHandover.rehydrate("ord_1", "ORD-1", AT, "staff-1", "scan").rank).toBe(1);
    expect(OrderHandover.rehydrate("ord_1", "ORD-1-2", AT, "staff-1", "scan", 2).rank).toBe(2);
  });
});
