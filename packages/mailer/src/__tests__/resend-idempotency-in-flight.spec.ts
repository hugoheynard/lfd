import { CircuitBreakerMailer } from "../circuit-breaker.js";
import { MailerIdempotencyInFlightError, MailerSendError } from "../errors.js";
import { renderLayout } from "../html.js";
import { ResendMailer, type ResendLike } from "../resend-mailer.js";
import type { SendMailArgs, TemplateRegistry } from "../types.js";

/*
 * Le 409 `concurrent_idempotent_requests` de Resend (2026-11-06, plan
 * `plan-service-e-mails.md` § 8) : une requête de même clé est encore en
 * cours. Le bloc `mail` doit le distinguer d'un échec, et le disjoncteur ne
 * doit pas le compter.
 */

interface TestMails {
  "test.hello": { name: string };
}

const registry: TemplateRegistry<TestMails> = {
  "test.hello": (data) => ({
    subject: `Bonjour ${data.name}`,
    html: renderLayout({ title: "Bonjour", body: data.name }),
  }),
};

const HELLO: SendMailArgs<TestMails, "test.hello"> = {
  to: "client@exemple.fr",
  template: "test.hello",
  data: { name: "Camille" },
  idempotencyKey: "hello:1",
};

type Reply = Awaited<ReturnType<ResendLike["emails"]["send"]>>;

const ACCEPTED: Reply = { data: { id: "re_1" }, error: null, headers: {} };

function conflict(name: string): Reply {
  return {
    data: null,
    error: { message: "Same key in flight", name, statusCode: 409 },
    headers: {},
  };
}

function scripted(...replies: readonly Reply[]): ResendLike {
  let calls = 0;
  return {
    emails: {
      send: () => {
        const reply = replies[calls];
        calls += 1;
        return reply === undefined
          ? Promise.reject(new RangeError("aucune réponse prévue"))
          : Promise.resolve(reply);
      },
    },
  };
}

function mailerOf(client: ResendLike): ResendMailer<TestMails> {
  return new ResendMailer<TestMails>({ client, registry, fromAddress: "LFC <noreply@lfc.fr>" });
}

describe("le 409 d'une requête de même clé en cours (Resend)", () => {
  it("se lève en MailerIdempotencyInFlightError, qui reste une MailerSendError", async () => {
    const refusal = mailerOf(scripted(conflict("concurrent_idempotent_requests"))).send(HELLO);

    await expect(refusal).rejects.toBeInstanceOf(MailerIdempotencyInFlightError);
    await expect(refusal).rejects.toBeInstanceOf(MailerSendError);
  });

  it("un autre 409 reste une erreur d'envoi ordinaire", async () => {
    const refusal = mailerOf(scripted(conflict("invalid_idempotent_request"))).send(HELLO);

    await expect(refusal).rejects.toBeInstanceOf(MailerSendError);
    await expect(refusal).rejects.not.toBeInstanceOf(MailerIdempotencyInFlightError);
  });

  it("n'ouvre pas le disjoncteur : le fournisseur a répondu", async () => {
    const mailer = mailerOf(scripted(conflict("concurrent_idempotent_requests"), ACCEPTED));
    // Seuil à un : un seul échec compté suffirait à l'ouvrir.
    const breaker = new CircuitBreakerMailer<TestMails>(mailer, { threshold: 1, now: () => 0 });

    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerIdempotencyInFlightError);
    await expect(breaker.send(HELLO)).resolves.toEqual({ providerId: "re_1" });
  });
});
