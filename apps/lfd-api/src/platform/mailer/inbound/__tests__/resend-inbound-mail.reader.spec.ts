import { ResendInboundReader, type ResendReceivingLike } from "@lfd/mailer";

import { InboundMailUnreadableError } from "../inbound-mail-unreadable.error.js";
import { ResendInboundMailReader } from "../resend-inbound-mail.reader.js";

type Reply = Awaited<ReturnType<ResendReceivingLike["emails"]["receiving"]["get"]>>;

function resendAnswering(reply: Reply): ResendInboundReader {
  return new ResendInboundReader({
    emails: { receiving: { get: () => Promise.resolve(reply) } },
  });
}

describe("ResendInboundMailReader", () => {
  it("rend le message reçu, pièces jointes DÉCRITES", async () => {
    const reader = new ResendInboundMailReader(
      resendAnswering({
        data: {
          id: "in_1",
          from: "Jean <jean@exemple.fr>",
          subject: "Re: ORD-12",
          text: "Merci",
          html: null,
          headers: null,
          attachments: [{ filename: null, size: 42, content_type: "image/png" }],
        },
        error: null,
      }),
    );

    await expect(reader.read("in_1")).resolves.toEqual({
      id: "in_1",
      from: "Jean <jean@exemple.fr>",
      subject: "Re: ORD-12",
      text: "Merci",
      html: null,
      headers: {},
      attachments: [{ filename: "", contentType: "image/png", sizeBytes: 42 }],
    });
  });

  it("un refus de Resend devient une panne technique, que Resend rejouera", async () => {
    const reader = new ResendInboundMailReader(
      resendAnswering({ data: null, error: { message: "not found", name: "not_found" } }),
    );

    await expect(reader.read("in_1")).rejects.toBeInstanceOf(InboundMailUnreadableError);
  });

  it("sans clé Resend, rien ne se lit", async () => {
    await expect(new ResendInboundMailReader(null).read("in_1")).rejects.toBeInstanceOf(
      InboundMailUnreadableError,
    );
  });
});
