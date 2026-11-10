import type { SupportRequestView } from "@lfd/contracts";

import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { availabilityOf, SupportRequestedMail } from "../support-requested-mail.service.js";
import { OneRequest, REQUEST, Settings } from "./support-request-doubles.js";

/** L'unité de travail du test : la porte doublée refuse `send` hors d'elle, comme la vraie. */
const uow = new OpenableUnitOfWork();

async function deliver(
  stored: SupportRequestView | null,
  inbox: string | null,
  mails = new RecordingMail(uow),
): Promise<RecordingMail> {
  const mail = new SupportRequestedMail(new OneRequest(stored), mails, new Settings(inbox));
  await uow.run(() => mail.request("sr_1", "Le Pain Quotidien"));
  return mails;
}

describe("SupportRequestedMail — la demande de rappel, à la boîte de l'équipe", () => {
  it("relit la demande et DEMANDE staff.support-requested au bloc mail", async () => {
    const mails = await deliver(REQUEST, "equipe@lfc.fr");
    expect(mails.awaitedReceipt).toEqual([]);
    expect(mails.queued).toEqual([
      {
        to: "equipe@lfc.fr",
        template: "staff.support-requested",
        data: {
          contactName: "Le Pain Quotidien",
          purposeLabel: "Facturation",
          availability: "Rappel au plus vite",
          phoneNumber: "06 12 34 56 78",
          message: "Une facture en double",
        },
        subjects: [
          { type: "account", id: "user_1" },
          { type: "company", id: "c1" },
        ],
        idempotencyKey: "mail:support.requested:sr_1",
      },
    ]);
  });

  it("sans boîte d'équipe, rien ne part", async () => {
    expect((await deliver(REQUEST, null)).queued).toEqual([]);
  });

  it("une demande introuvable n'envoie rien", async () => {
    expect((await deliver(null, "equipe@lfc.fr")).queued).toEqual([]);
  });

  it("laisse remonter une demande refusée par le bloc : le dépôt tombe avec elle", async () => {
    const mails = new RecordingMail(uow);
    mails.failWith = new Error("base indisponible");
    await expect(deliver(REQUEST, "equipe@lfc.fr", mails)).rejects.toThrow("base indisponible");
  });

  it("refuse d'être appelé hors d'une unité de travail, comme la porte", async () => {
    const mail = new SupportRequestedMail(
      new OneRequest(REQUEST),
      new RecordingMail(new OpenableUnitOfWork()),
      new Settings("equipe@lfc.fr"),
    );
    await expect(mail.request("sr_1", null)).rejects.toThrow("hors transaction");
  });
});

describe("availabilityOf", () => {
  it("par e-mail", () => {
    expect(availabilityOf({ ...REQUEST, channel: "email" })).toBe("Par e-mail");
  });

  it("un créneau daté : le jour en toutes lettres et la demi-journée", () => {
    expect(
      availabilityOf({ ...REQUEST, asap: false, scheduledDate: "2026-06-09", slot: "afternoon" }),
    ).toBe("mardi 9 juin, l'après-midi");
  });
});
