import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import {
  OrderChangeAppliedEvent,
  OrderChangeRefusedEvent,
} from "../../../domain/order-change.events.js";
import { ORDER, orderChange } from "../../../domain/__tests__/request-fixtures.js";
import { OrderChangeAppliedMail } from "../order-change-applied-mail.service.js";
import { OrderChangeRefusedMail } from "../order-change-refused-mail.service.js";

const SUBJECT = { requestId: "q1", order: ORDER, baseRevision: 1 };
const APPLIED = { revision: 2, totalCents: 4250, previousTotalCents: 3800 };

function recording(): { uow: OpenableUnitOfWork; mails: RecordingMail } {
  const uow = new OpenableUnitOfWork();
  return { uow, mails: new RecordingMail(uow) };
}

/** Les deux réponses partent à l'auteur de la demande (M4), demandées au bloc `mail` (S2c). */
describe("les courriels de réponse à une demande de modification", () => {
  it("appliquée : au client, la référence et les totaux de la révision appliquée", async () => {
    const { uow, mails } = recording();
    await uow.run(() =>
      new OrderChangeAppliedMail(mails).request(
        new OrderChangeAppliedEvent(orderChange(), SUBJECT, APPLIED),
      ),
    );
    expect(mails.queued).toEqual([
      {
        to: "jean@exemple.fr",
        template: "customer.order-change-applied",
        idempotencyKey: "order-change-applied:q1",
        subjects: [{ type: "order", id: ORDER.id }],
        data: { reference: "ORD-0001", totalCents: 4250, previousTotalCents: 3800, locale: "fr" },
      },
    ]);
  });

  it("refusée : au client, avec le mot de l'équipe", async () => {
    const { uow, mails } = recording();
    await uow.run(() =>
      new OrderChangeRefusedMail(mails).request(
        new OrderChangeRefusedEvent(orderChange(), SUBJECT, "La fournée est lancée."),
      ),
    );
    expect(mails.queued).toEqual([
      {
        to: "jean@exemple.fr",
        template: "customer.order-change-refused",
        idempotencyKey: "order-change-refused:q1",
        subjects: [{ type: "order", id: ORDER.id }],
        data: { reference: "ORD-0001", reason: "La fournée est lancée.", locale: "fr" },
      },
    ]);
  });

  it("une demande d'e-mail refusée remonte : la réponse échoue avec elle", async () => {
    const { uow, mails } = recording();
    mails.failWith = new Error("boîte d'envoi indisponible");
    await expect(
      uow.run(() =>
        new OrderChangeAppliedMail(mails).request(
          new OrderChangeAppliedEvent(orderChange(), SUBJECT, APPLIED),
        ),
      ),
    ).rejects.toThrow("boîte d'envoi indisponible");
  });
});
