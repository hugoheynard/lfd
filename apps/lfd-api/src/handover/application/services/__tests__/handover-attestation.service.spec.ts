import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../platform/outbox/__tests__/transactional-durable.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { HandoverSubject } from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandedOverEvent } from "../../../channels/commerce/order-handed-over.event.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import {
  HandoverRefusedError,
  TransferNotReceivedError,
  TransferNotYetComposedError,
} from "../../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { ShipmentRef } from "../../../../production/channels/handover/index.js";
import { FixedOrderLock } from "../../__tests__/fixed-order-lock.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { FixedTransferStatus } from "../../__tests__/fixed-transfer-status.js";
import { HandoverAttestation } from "../handover-attestation.service.js";

/**
 * Le geste commun aux deux portes de retrait, éprouvé sur ce qui compte : **qui
 * publie, et quand**.
 *
 * Un fait publié par le perdant d'une course ferait partir un second courriel au
 * client et compterait deux retraits au journal, là où la base n'en porte qu'un.
 * C'est le genre de défaut qu'aucun écran ne montre.
 */

const AT = new Date("2026-09-07T16:30:00.000Z");

function subject(): HandoverSubject {
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
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 2 }],
    // Un reste colisé : le rang 2 est à tendre (plan E7 reliquat, L4c).
    laterShipments: [
      {
        rank: 2,
        prepared: true,
        lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 1 }],
      },
    ],
  };
}

/** Un dépôt qui rend ce qu'on lui dit, et note ce qu'on lui a gravé. */
function repositoryOf(existing: OrderHandover | null, won: boolean) {
  const written: OrderHandover[] = [];
  const asked: ShipmentRef[] = [];
  const repository: OrderHandoverRepository = {
    findByShipment: (shipment) => {
      asked.push(shipment);
      return Promise.resolve(existing);
    },
    attest: (handover) => {
      written.push(handover);
      return Promise.resolve(won);
    },
  };
  return { repository, written, asked };
}

/** Les faits `handover.handed_over` VALIDÉS — ceux d'une unité annulée n'y sont pas. */
class Outbox {
  readonly uow = new TransactionalUnitOfWork();
  readonly publisher = new TransactionalDurablePublisher(this.uow);

  get published(): readonly DurableFact[] {
    return this.uow.of("handover.handed_over");
  }
}

/** Le fait attendu d'une attestation, tel que la boîte d'envoi le garde. */
function factOf(
  handover: { at: Date; by: string; via: "scan" | "manual" },
  reannouncedAt: Date | null = null,
): DurableFact {
  return new OrderHandedOverEvent(
    "ord_1",
    1,
    "ORD-ABCD-1234",
    handover.at,
    handover.by,
    handover.via,
    reannouncedAt,
  ).durableFact();
}

/** L'horloge gelée : le geste doit prendre son instant au port, pas au mur. */
class FixedClock extends Clock {
  now(): Date {
    return AT;
  }
}

function attestationOf(
  existing: OrderHandover | null,
  won: boolean,
  holds: FixedQualityHolds = new FixedQualityHolds(),
  transfers: FixedTransferStatus = new FixedTransferStatus(),
  lock: FixedOrderLock = new FixedOrderLock(),
) {
  const { repository, written, asked } = repositoryOf(existing, won);
  const events = new Outbox();
  const service = new HandoverAttestation(
    repository,
    new FixedClock(),
    events.uow,
    events.publisher,
    holds,
    transfers,
    lock,
  );
  return { service, written, events, lock, asked };
}

/**
 * Un dépôt qui rend une réponse DIFFÉRENTE à chaque lecture — hérite du port,
 * pas un littéral castable : c'est la seule façon d'éprouver que le perdant
 * RELIT après avoir perdu, au lieu de réutiliser sa lecture d'avant la course.
 */
class SequentialOrderHandoverRepository extends OrderHandoverRepository {
  private nextRead = 0;

  constructor(
    private readonly reads: readonly (OrderHandover | null)[],
    private readonly won: boolean,
  ) {
    super();
  }

  findByShipment(): Promise<OrderHandover | null> {
    const value = this.reads[this.nextRead] ?? null;
    this.nextRead += 1;
    return Promise.resolve(value);
  }

  attest(): Promise<boolean> {
    return Promise.resolve(this.won);
  }
}

describe("HandoverAttestation", () => {
  it("grave, écrit le fait durable dans la même unité de travail, et rend l'attestation", async () => {
    const { service, written, events } = attestationOf(null, true);

    const [handover] = await service.attest(subject(), [1], "staff-1", "scan");

    expect(written).toHaveLength(1);
    expect(handover?.handedOverBy).toBe("staff-1");
    expect(handover?.via).toBe("scan");
    expect(handover?.handedOverAt).toEqual(AT);
    expect(events.published).toEqual([factOf({ at: AT, by: "staff-1", via: "scan" })]);
    expect(events.published[0]?.key).toBe("handover.handed_over:ord_1");
  });

  /** Lot T2 du transfert interne (Q-T2) : pas de remise sans marchandise au site. */
  it("refuse une commande dont le transfert n'est pas reçu, sans rien écrire ni publier", async () => {
    for (const state of ["planned", "departed"] as const) {
      const { service, written, events } = attestationOf(
        null,
        true,
        new FixedQualityHolds(),
        new FixedTransferStatus(new Map([["ord_1", state]])),
      );

      const refusal = service.attest(subject(), [1], "staff-1", "scan");

      await expect(refusal).rejects.toBeInstanceOf(TransferNotReceivedError);
      await expect(refusal).rejects.toThrow(/Réceptionner/u);
      expect(written).toHaveLength(0);
      expect(events.published).toEqual([]);
    }
  });

  /**
   * Régression F4 (lot T3 du transfert interne) : un retrait d'un site servi
   * par transfert, passé avant la clôture, n'était porté par aucun transfert
   * et se remettait sans refus — alors que sa marchandise n'était pas au site.
   */
  it("refuse un retrait d'un site servi par transfert qu'aucun transfert ne porte encore", async () => {
    const { service, written, events } = attestationOf(
      null,
      true,
      new FixedQualityHolds(),
      new FixedTransferStatus(new Map([["ord_1", "awaiting"]])),
    );

    const refusal = service.attest(subject(), [1], "staff-1", "scan");

    await expect(refusal).rejects.toBeInstanceOf(TransferNotYetComposedError);
    await expect(refusal).rejects.toThrow(/aucun transfert ne la porte encore/u);
    expect(written).toHaveLength(0);
    expect(events.published).toEqual([]);
  });

  it("remet une commande dont le transfert est reçu", async () => {
    const { service, written } = attestationOf(
      null,
      true,
      new FixedQualityHolds(),
      new FixedTransferStatus(new Map([["ord_1", "received"]])),
    );

    await service.attest(subject(), [1], "staff-1", "scan");

    expect(written).toHaveLength(1);
  });

  it("ne publie RIEN quand un autre poste a gagné la course", async () => {
    // Le perdant lève. S'il publiait aussi, le client recevrait deux courriels
    // et le journal compterait deux retraits — pour un seul sac qui part.
    const { service, events } = attestationOf(null, false);

    await expect(service.attest(subject(), [1], "staff-2", "scan")).rejects.toThrow(
      HandoverRefusedError,
    );
    expect(events.published).toEqual([]);
  });

  it("prend l'instant à l'HORLOGE, pas au mur", async () => {
    // `lint:clock-port` l'exige, et la raison est ici : deux `new Date()` dans
    // le même geste dériveraient, et l'attestation ne dirait plus la même heure
    // que le fait publié.
    const { service, written, events } = attestationOf(null, true);

    await service.attest(subject(), [1], "staff-1", "manual");

    expect(written[0]?.handedOverAt).toBe(AT);
    expect(events.published[0]?.payload).toMatchObject({ handedOverAt: AT.toISOString() });
  });

  it("laisse l'agrégat REFUSER avant d'écrire quoi que ce soit", async () => {
    // Une VRAIE attestation, construite par la factory de réhydratation : un
    // objet littéral casté dériverait du type qu'il prétend jouer sans que rien
    // ne rougisse — et c'est dans un test que ça coûte le plus cher.
    const earlier = OrderHandover.rehydrate(
      "ord_1",
      "ORD-ABCD-1234",
      new Date("2026-09-07T15:00:00.000Z"),
      "staff-0",
      "scan",
    );
    const { service, written } = attestationOf(earlier, true);

    await expect(service.attest(subject(), [1], "staff-1", "scan")).rejects.toThrow(
      /déjà été retirée/u,
    );
    expect(written).toEqual([]);
  });

  it("REPUBLIE l'attestation existante en refusant — le geste, pas la propagation", async () => {
    // 🔴 Le refus fermait le seul rattrapage possible. Le sac est parti (rien à
    // refaire), mais le commerce ne l'a peut-être pas appris (tout à refaire) :
    // ce sont deux questions, et une seule réponse les confondait.
    //
    // On republie l'attestation EXISTANTE, jamais celle qu'on vient de refuser :
    // l'heure et l'auteur sont ceux du vrai retrait.
    const earlier = OrderHandover.rehydrate(
      "ord_1",
      "ORD-ABCD-1234",
      new Date("2026-09-07T15:00:00.000Z"),
      "staff-0",
      "manual",
    );
    const { service, events } = attestationOf(earlier, true);

    await expect(service.attest(subject(), [1], "staff-1", "scan")).rejects.toThrow(
      /déjà été retirée/u,
    );

    // Une RÉANNONCE : un fait neuf par geste, sous la clé de l'instant du geste.
    expect(events.published).toEqual([
      factOf({ at: new Date("2026-09-07T15:00:00.000Z"), by: "staff-0", via: "manual" }, AT),
    ]);
  });

  it("ne republie RIEN quand le refus ne vient pas d'une remise déjà faite", async () => {
    // Une commande annulée n'a aucune attestation : il n'y a rien à réannoncer,
    // et publier un fait qui n'a pas eu lieu serait pire que le silence.
    const { service, events } = attestationOf(null, true);

    await expect(
      service.attest({ ...subject(), status: "cancelled" }, [1], "staff-1", "scan"),
    ).rejects.toThrow(/annulée/u);

    expect(events.published).toEqual([]);
  });

  it("RELIT après avoir perdu la course — le fait republié est celui du GAGNANT, pas la lecture d'avant", async () => {
    // 🔴 Ce que l'arbitrage laisse ouvert si on ne le fixe pas : au moment de
    // notre première lecture, personne n'avait encore attesté (`existing`
    // était `null`). Entre cette lecture et notre écriture, un autre poste
    // gagne. Si le perdant republiait sa lecture PÉRIMÉE, il republierait...
    // rien — exactement le silence que le rattrapage devait combler. Le
    // service doit donc RELIRE après avoir perdu, pas réutiliser `existing`.
    const winner = OrderHandover.rehydrate(
      "ord_1",
      "ORD-ABCD-1234",
      new Date("2026-09-07T16:29:00.000Z"),
      "staff-winner",
      "scan",
    );
    const repository = new SequentialOrderHandoverRepository([null, winner], false);
    const events = new Outbox();
    const service = new HandoverAttestation(
      repository,
      new FixedClock(),
      events.uow,
      events.publisher,
      new FixedQualityHolds(),
      new FixedTransferStatus(),
      new FixedOrderLock(),
    );

    await expect(service.attest(subject(), [1], "staff-2", "manual")).rejects.toBeInstanceOf(
      HandoverRefusedError,
    );

    expect(events.published).toEqual([
      factOf({ at: new Date("2026-09-07T16:29:00.000Z"), by: "staff-winner", via: "scan" }, AT),
    ]);
  });

  describe("la course avec l'annulation (annulation-par-le-staff.md, C3.6)", () => {
    /**
     * Régression (2026-10-25) : le comptoir remettait une commande que le
     * staff annulait au même instant, et les deux gestes passaient — une
     * attestation orpheline sur une commande annulée et remboursée.
     */
    it("annulée pendant que le comptoir la tenait : refus nommé, rien gravé ni publié", async () => {
      const { service, written, events, lock } = attestationOf(
        null,
        true,
        undefined,
        undefined,
        new FixedOrderLock("cancelled"),
      );

      await expect(service.attest(subject(), [1], "staff-1", "manual")).rejects.toMatchObject({
        code: "handover.refused",
        message: expect.stringContaining("vient d'être annulée") as string,
      });
      expect(lock.locked).toEqual(["ord_1"]);
      expect(written).toEqual([]);
      expect(events.published).toEqual([]);
    });

    it("prend le verrou de la commande avant de graver", async () => {
      const { service, written, lock } = attestationOf(null, true);

      await service.attest(subject(), [1], "staff-1", "manual");

      expect(lock.locked).toEqual(["ord_1"]);
      expect(written).toHaveLength(1);
    });
  });

  describe("la retenue qualité (plan-controle-qualite.md, D4)", () => {
    // La date demandée range la commande dans un plan : c'est le jour que la
    // question porte. Elle n'est jamais comparée à l'horloge ici.
    const planned = (): HandoverSubject => ({
      ...subject(),
      requestedDeliveryDate: new Date("2026-09-08T00:00:00.000Z"),
    });

    it("refuse une commande retenue, sans rien écrire ni publier", async () => {
      const holds = new FixedQualityHolds(["ord_1"]);
      const { service, written, events } = attestationOf(null, true, holds);

      await expect(service.attest(planned(), [1], "staff-1", "scan")).rejects.toThrow(
        "Commande en cours de vérification.",
      );
      expect(written).toEqual([]);
      expect(events.published).toEqual([]);
      expect(holds.asked).toEqual([{ serviceDay: "2026-09-08", orderIds: ["ord_1"] }]);
    });

    it("dit « déjà retirée » d'un sac parti puis retenu, et republie le vrai retrait", async () => {
      const earlier = OrderHandover.rehydrate(
        "ord_1",
        "ORD-ABCD-1234",
        new Date("2026-09-07T15:00:00.000Z"),
        "staff-0",
        "scan",
      );
      const holds = new FixedQualityHolds(["ord_1"]);
      const { service, events } = attestationOf(earlier, true, holds);

      await expect(service.attest(planned(), [1], "staff-1", "scan")).rejects.toThrow(
        /déjà été retirée/u,
      );
      expect(events.published).toHaveLength(1);
    });

    it("ne demande rien pour une commande sans jour demandé — aucun plan ne la porte", async () => {
      const holds = new FixedQualityHolds(["ord_1"]);
      const { service, written } = attestationOf(null, true, holds);

      await service.attest(subject(), [1], "staff-1", "manual");

      expect(written).toHaveLength(1);
      expect(holds.asked).toEqual([]);
    });
  });
});

describe("HandoverAttestation — le rang de la ligne (plan E7 reliquat, L3d)", () => {
  it("une attestation gravée au comptoir émet le rang 1 : clé et charge d'aujourd'hui", async () => {
    const { service, events } = attestationOf(null, true);

    await service.attest(subject(), [1], "staff-1", "scan");

    expect(events.published).toEqual([factOf({ at: AT, by: "staff-1", via: "scan" })]);
    expect(events.published[0]?.key).toBe("handover.handed_over:ord_1");
  });

  it("réannoncée, une attestation de rang 2 émet SON rang — jamais un rang supposé", async () => {
    const remainder = OrderHandover.rehydrate(
      "ord_1",
      "ORD-ABCD-1234-2",
      AT,
      "staff-0",
      "manual",
      2,
    );
    const { service, events } = attestationOf(null, true);

    await events.uow.run(() => service.reannounce(remainder));

    const [fact] = events.published;
    expect(fact?.payload).toMatchObject({ orderId: "ord_1", rank: 2 });
    expect(fact?.key).toBe(`handover.handed_over:ord_1:r2:reannounced:${AT.toISOString()}`);
  });
});

describe("HandoverAttestation — le retrait par envoi (plan E7 reliquat, L4b)", () => {
  it("grave le reliquat sous SA référence et SON rang, et le fait porte sa clé", async () => {
    const { service, written, events, asked } = attestationOf(null, true);

    await service.attest({ ...subject(), status: "fulfilled" }, [2], "staff-1", "scan");

    expect(asked).toEqual([ShipmentRef.of("ord_1", 2)]);
    expect(written.map(({ rank, reference }) => ({ rank, reference }))).toEqual([
      { rank: 2, reference: "ORD-ABCD-1234-2" },
    ]);
    expect(events.published[0]?.payload).toMatchObject({ rank: 2, reference: "ORD-ABCD-1234-2" });
    expect(events.published[0]?.key).toBe("handover.handed_over:ord_1:r2");
  });

  it("une commande déjà soldée au rang 1 laisse remettre son reliquat", async () => {
    // `fulfilled` est le statut du rang 1 (L5 le dérivera) : la règle ne bloque
    // que `draft` et `cancelled`, et « déjà retiré » se lit sur l'envoi demandé.
    const { service, written } = attestationOf(null, true);

    await service.attest({ ...subject(), status: "fulfilled" }, [2], "staff-1", "manual");

    expect(written).toHaveLength(1);
  });

  it("un reliquat déjà retiré est refusé en le nommant, et SA réannonce part", async () => {
    const remainder = OrderHandover.rehydrate("ord_1", "ORD-ABCD-1234-2", AT, "staff-0", "scan", 2);
    const { service, written, events } = attestationOf(remainder, true);

    await expect(
      service.attest({ ...subject(), status: "fulfilled" }, [2], "staff-1", "scan"),
    ).rejects.toThrow("Le reste de cette commande (envoi 2) a déjà été retiré.");

    expect(written).toEqual([]);
    expect(events.published.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ rank: 2, reference: "ORD-ABCD-1234-2" }),
    ]);
  });

  it("le reliquat perdu à la course est refusé en nommant le reste", async () => {
    const { service } = attestationOf(null, false);

    await expect(
      service.attest({ ...subject(), status: "fulfilled" }, [2], "staff-1", "scan"),
    ).rejects.toThrow("Le reste de cette commande vient d'être retiré à un autre poste.");
  });

  it("prend le verrou commun avec l'annulation, et refuse un reliquat d'une commande annulée", async () => {
    const lock = new FixedOrderLock("cancelled");
    const { service, written, events } = attestationOf(
      null,
      true,
      new FixedQualityHolds(),
      new FixedTransferStatus(),
      lock,
    );

    await expect(
      service.attest({ ...subject(), status: "fulfilled" }, [2], "staff-1", "scan"),
    ).rejects.toThrow(/vient d'être annulée/u);

    expect(lock.locked).toEqual(["ord_1"]);
    expect(written).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("HandoverAttestation — deux envois d'un geste (plan E7 reliquat, L4c)", () => {
  it("remet les deux envois cochés dans UNE unité de travail : deux attestations, deux faits", async () => {
    const { service, written, events } = attestationOf(null, true);

    const handovers = await service.attest(subject(), [1, 2], "staff-1", "scan");

    expect(handovers.map(({ rank }) => rank)).toEqual([1, 2]);
    expect(written.map(({ rank, reference }) => ({ rank, reference }))).toEqual([
      { rank: 1, reference: "ORD-ABCD-1234" },
      { rank: 2, reference: "ORD-ABCD-1234-2" },
    ]);
    expect(events.published.map((fact) => fact.key)).toEqual([
      "handover.handed_over:ord_1",
      "handover.handed_over:ord_1:r2",
    ]);
  });

  it("un reste pas encore colisé est refusé en le disant, et le rang 1 coché avec lui ne part pas", async () => {
    const { service, events } = attestationOf(null, true);
    const planned = {
      ...subject(),
      laterShipments: [{ rank: 2, prepared: false, lines: [] }],
    };

    await expect(service.attest(planned, [1, 2], "staff-1", "scan")).rejects.toThrow(
      "Le reste de cette commande (envoi 2) n'est pas prêt : son bac n'a pas été fermé au colisage. Ne le remettez pas encore.",
    );

    // L'unité annulée n'a rien validé : aucun fait du rang 1 n'est parti.
    expect(events.published).toEqual([]);
  });

  it("un rang qu'aucun bon ne porte est refusé comme un reste pas prêt", async () => {
    const { service, written } = attestationOf(null, true);

    await expect(service.attest(subject(), [3], "staff-1", "manual")).rejects.toThrow(
      /envoi 3\) n'est pas prêt/u,
    );
    expect(written).toEqual([]);
  });
});
