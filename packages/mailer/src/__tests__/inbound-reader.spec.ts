import { Resend } from "resend";

import { MailerReceiveError } from "../errors.js";
import { ResendInboundReader, type ResendReceivingLike } from "../inbound-reader.js";

/*
 * La lecture d'un e-mail REÇU (plan `plan-reponses-par-e-mail.md`, R2) : le
 * message décrit, ses pannes sous une seule forme.
 */

type Reply = Awaited<ReturnType<ResendReceivingLike["emails"]["receiving"]["get"]>>;

function readerAnswering(reply: Reply | Error): ResendInboundReader {
  return new ResendInboundReader({
    emails: {
      receiving: {
        get: () => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)),
      },
    },
  });
}

describe("ResendInboundReader", () => {
  it("le SDK installé a bien la forme que le paquet consomme", () => {
    // Vérifié par le compilateur : si `resend` change `emails.receiving.get`,
    // cette ligne ne compile plus.
    const client: ResendReceivingLike = new Resend("re_test_key");
    expect(typeof client.emails.receiving.get).toBe("function");
  });

  it("décrit les pièces jointes sans leur contenu, et un nom absent est vide", async () => {
    const mail = await readerAnswering({
      data: {
        id: "in_1",
        from: "a@b.fr",
        subject: "Bonjour",
        text: null,
        html: "<p>Bonjour</p>",
        headers: { "Auto-Submitted": "no" },
        attachments: [{ filename: null, size: 10, content_type: "application/pdf" }],
      },
      error: null,
    }).read("in_1");

    expect(mail.headers).toEqual({ "Auto-Submitted": "no" });
    expect(mail.attachments).toEqual([
      { filename: "", contentType: "application/pdf", sizeBytes: 10 },
    ]);
  });

  it("un refus de Resend lève une `MailerReceiveError` retentable", async () => {
    const reading = readerAnswering({
      data: null,
      error: { message: "not found", name: "not_found", statusCode: 404 },
    }).read("in_1");

    await expect(reading).rejects.toBeInstanceOf(MailerReceiveError);
    await expect(reading).rejects.toMatchObject({ retryable: true });
  });

  it("une panne réseau lève la même erreur", async () => {
    await expect(
      readerAnswering(new TypeError("fetch failed")).read("in_1"),
    ).rejects.toBeInstanceOf(MailerReceiveError);
  });
});
