import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { HandoverSubject } from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandedOverEvent } from "../../../channels/commerce/order-handed-over.event.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import { HandoverRefusedError } from "../../../domain/errors/production-errors.js";
import type { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { HandoverAttestation } from "../handover-attestation.service.js";

/**
 * Le geste commun aux deux portes de remise, éprouvé sur ce qui compte : **qui
 * publie, et quand**.
 *
 * Un fait publié par le perdant d'une course ferait partir un second courriel au
 * client et compterait deux remises au journal, là où la base n'en porte qu'une.
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

/** Le collecteur de faits — un doublé qui implémente le port, pas un littéral. */
class CollectingPublisher extends DomainEventPublisher {
  readonly published: unknown[] = [];

  publish(event: unknown): void {
    this.published.push(event);
  }

  async publishTraced(): Promise<void> {
    // Aucun fait journalisé ne part d'ici : le fournil publie sur le bus, et
    // c'est le commerce qui décide ce qui entre au journal.
    return Promise.resolve();
  }
}

/** L'horloge gelée : le geste doit prendre son instant au port, pas au mur. */
class FixedClock extends Clock {
  now(): Date {
    return AT;
  }
}

function attestationOf(existing: OrderHandover | null, won: boolean) {
  const { repository, written } = repositoryOf(existing, won);
  const events = new CollectingPublisher();
  const service = new HandoverAttestation(repository, new FixedClock(), events);
  return { service, written, events };
}

describe("HandoverAttestation", () => {
  it("grave, publie le fait, et rend l'attestation obtenue", async () => {
    const { service, written, events } = attestationOf(null, true);

    const view = await service.attest(subject(), "staff-1", "scan");

    expect(written).toHaveLength(1);
    expect(view.handedOverBy).toBe("staff-1");
    expect(view.handedOverVia).toBe("scan");
    expect(view.handedOverAt).toBe(AT.toISOString());
    expect(events.published).toEqual([
      new OrderHandedOverEvent("ORD-ABCD-1234", AT, "staff-1", "scan"),
    ]);
  });

  it("ne publie RIEN quand un autre poste a gagné la course", async () => {
    // Le perdant lève. S'il publiait aussi, le client recevrait deux courriels
    // et le journal compterait deux remises — pour un seul sac qui part.
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
    expect(events.published[0]).toMatchObject({ handedOverAt: AT });
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
    const { service, written, events } = attestationOf(earlier, true);

    await expect(service.attest(subject(), "staff-1", "scan")).rejects.toThrow(/déjà été remise/u);
    expect(written).toEqual([]);
    expect(events.published).toEqual([]);
  });
});
