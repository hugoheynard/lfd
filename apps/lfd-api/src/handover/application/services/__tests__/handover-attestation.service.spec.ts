import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../platform/outbox/__tests__/transactional-durable.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { HandoverSubject } from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandedOverEvent } from "../../../channels/commerce/order-handed-over.event.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import { HandoverRefusedError } from "../../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { HandoverAttestation } from "../handover-attestation.service.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";

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
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 2 }],
  };
}

/** Un dépôt qui rend ce qu'on lui dit, et note ce qu'on lui a gravé. */
function repositoryOf(existing: OrderHandover | null, won: boolean) {
  const written: OrderHandover[] = [];
  const repository: OrderHandoverRepository = {
    findByOrderId: () => Promise.resolve(existing),
    attest: (handover) => {
      written.push(handover);
      return Promise.resolve(won);
    },
  };
  return { repository, written };
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

/** L'annuaire du comptoir : `staff-1` est Inès. */
const AUTHORS = new FixedStaffAuthorDirectory(
  authorsKnownAs({ firstName: "Inès", lastName: "Moreau" }, "staff-1"),
);

function attestationOf(
  existing: OrderHandover | null,
  won: boolean,
  holds: FixedQualityHolds = new FixedQualityHolds(),
) {
  const { repository, written } = repositoryOf(existing, won);
  const events = new Outbox();
  const service = new HandoverAttestation(
    repository,
    new FixedClock(),
    events.uow,
    events.publisher,
    AUTHORS,
    holds,
  );
  return { service, written, events };
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

  findByOrderId(): Promise<OrderHandover | null> {
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

    const view = await service.attest(subject(), "staff-1", "scan");

    expect(written).toHaveLength(1);
    expect(view.handedOverBy).toBe("staff-1");
    // Le nom, résolu par l'annuaire (`architecture-journalisation.md` §12, D3).
    expect(view.handedOverByName).toBe("Inès Moreau");
    expect(view.handedOverVia).toBe("scan");
    expect(view.handedOverAt).toBe(AT.toISOString());
    expect(events.published).toEqual([factOf({ at: AT, by: "staff-1", via: "scan" })]);
    expect(events.published[0]?.key).toBe("handover.handed_over:ord_1");
  });

  it("ne publie RIEN quand un autre poste a gagné la course", async () => {
    // Le perdant lève. S'il publiait aussi, le client recevrait deux courriels
    // et le journal compterait deux retraits — pour un seul sac qui part.
    const { service, events } = attestationOf(null, false);

    await expect(service.attest(subject(), "staff-2", "scan")).rejects.toThrow(
      HandoverRefusedError,
    );
    expect(events.published).toEqual([]);
  });

  it("prend l'instant à l'HORLOGE, pas au mur", async () => {
    // `lint:clock-port` l'exige, et la raison est ici : deux `new Date()` dans
    // le même geste dériveraient, et l'attestation ne dirait plus la même heure
    // que le fait publié.
    const { service, written, events } = attestationOf(null, true);

    await service.attest(subject(), "staff-1", "manual");

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

    await expect(service.attest(subject(), "staff-1", "scan")).rejects.toThrow(/déjà été retirée/u);
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

    await expect(service.attest(subject(), "staff-1", "scan")).rejects.toThrow(/déjà été retirée/u);

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
      service.attest({ ...subject(), status: "cancelled" }, "staff-1", "scan"),
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
      AUTHORS,
      new FixedQualityHolds(),
    );

    await expect(service.attest(subject(), "staff-2", "manual")).rejects.toBeInstanceOf(
      HandoverRefusedError,
    );

    expect(events.published).toEqual([
      factOf({ at: new Date("2026-09-07T16:29:00.000Z"), by: "staff-winner", via: "scan" }, AT),
    ]);
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

      await expect(service.attest(planned(), "staff-1", "scan")).rejects.toThrow(
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

      await expect(service.attest(planned(), "staff-1", "scan")).rejects.toThrow(
        /déjà été retirée/u,
      );
      expect(events.published).toHaveLength(1);
    });

    it("ne demande rien pour une commande sans jour demandé — aucun plan ne la porte", async () => {
      const holds = new FixedQualityHolds(["ord_1"]);
      const { service, written } = attestationOf(null, true, holds);

      await service.attest(subject(), "staff-1", "manual");

      expect(written).toHaveLength(1);
      expect(holds.asked).toEqual([]);
    });
  });
});
