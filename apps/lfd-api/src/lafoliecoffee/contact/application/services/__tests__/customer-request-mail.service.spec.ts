import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { CustomerRequestReceivedEvent } from "../../../domain/customer-request.events.js";
import {
  AT,
  contactRequest,
  orderProblem,
  photo,
} from "../../../domain/__tests__/request-fixtures.js";
import { CustomerRequestMail } from "../customer-request-mail.service.js";

const CONTACT = new CustomerRequestReceivedEvent(
  contactRequest({ audience: "b2b", companyId: "c1", body: "Bonjour" }),
  "commercial@lfc.fr",
);

function problemEvent(): CustomerRequestReceivedEvent {
  const problem = orderProblem();
  problem.attachPhoto("p1", photo(), AT);
  problem.attachPhoto("p2", photo(), AT);
  return new CustomerRequestReceivedEvent(problem, "sav@lfc.fr");
}

/** Demande l'e-mail dans une unité de travail ouverte, comme le font les trois gestes de dépôt. */
async function requestOf(event: CustomerRequestReceivedEvent): Promise<RecordingMail> {
  const uow = new OpenableUnitOfWork();
  const mails = new RecordingMail(uow);
  await uow.run(() => new CustomerRequestMail(mails).request(event));
  return mails;
}

describe("CustomerRequestMail — le courriel à l'adresse du motif, par le bloc `mail`", () => {
  it("un motif sans adresse : aucun e-mail demandé", async () => {
    const mails = await requestOf(
      new CustomerRequestReceivedEvent(contactRequest({ body: "Bonjour" }), null),
    );
    expect(mails.queued).toEqual([]);
  });

  it("« Nous écrire » : Reply-To = l'auteur, sans commande ni photo", async () => {
    const mails = await requestOf(CONTACT);
    expect(mails.queued).toEqual([
      {
        to: "commercial@lfc.fr",
        replyTo: "jean@exemple.fr",
        template: "staff.customer-request",
        idempotencyKey: "customer-request:q1",
        subjects: [
          { type: "customer_request", id: "q1" },
          { type: "company", id: "c1" },
          { type: "account", id: "u1" },
        ],
        data: {
          requestId: "q1",
          formLabel: "Nous écrire",
          orderNumber: "",
          photoCount: 0,
          reasonLabel: "Devenir client pro",
          urgent: true,
          authorName: "Jean Martin",
          authorEmail: "jean@exemple.fr",
          authorPhone: "06 00 00 00 00",
          originLabel: "Espace pro",
          clientLabel: "société c1",
          message: "Bonjour",
        },
      },
    ]);
  });

  it("un signalement porte la référence de la commande et le nombre de photos — pas les photos", async () => {
    const mails = await requestOf(problemEvent());
    expect(mails.queued[0]?.data).toMatchObject({
      formLabel: "Signaler un problème",
      orderNumber: "ORD-0001",
      photoCount: 2,
      clientLabel: "compte u1",
    });
    expect(JSON.stringify(mails.queued[0])).not.toContain("requests/");
  });

  it("une adresse refusée en en-tête est demandée SANS Reply-To plutôt que pas du tout", async () => {
    // Valide pour le domaine, refusée en en-tête par le mailer (chevron).
    const odd = contactRequest({
      author: { name: "Jean", email: "jean<x>@exemple.fr", phone: "" },
    });
    const mails = await requestOf(new CustomerRequestReceivedEvent(odd, "commercial@lfc.fr"));
    expect(mails.queued).toHaveLength(1);
    // La clé est écrite à l'appel (porte `mail-subject-declared`), sans valeur :
    // le bloc `mail` ne pose pas d'en-tête.
    expect(mails.queued[0]?.replyTo).toBeUndefined();
  });

  it("hors d'une unité de travail, la porte refuse : l'e-mail ne partirait pas avec la demande", async () => {
    const mails = new RecordingMail(new OpenableUnitOfWork());
    await expect(new CustomerRequestMail(mails).request(CONTACT)).rejects.toThrow(
      "request hors transaction",
    );
  });

  it("une demande d'e-mail refusée remonte : c'est le dépôt qui échoue", async () => {
    const uow = new OpenableUnitOfWork();
    const mails = new RecordingMail(uow);
    mails.failWith = new Error("boîte d'envoi indisponible");
    await expect(uow.run(() => new CustomerRequestMail(mails).request(CONTACT))).rejects.toThrow(
      "boîte d'envoi indisponible",
    );
  });
});
