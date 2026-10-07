import { CircuitBreakerMailer } from "../circuit-breaker.js";
import { MailerRateLimitedError, MailerSendError } from "../errors.js";
import { renderLayout } from "../html.js";
import { ResendMailer, type ResendLike } from "../resend-mailer.js";
import type { SendMailArgs, TemplateRegistry } from "../types.js";

/*
 * Les refus de cadence de Resend (429, 2026-10-07) : depuis que les courriels
 * de fond partent après la validation de leur transaction, plusieurs envois
 * d'un même balayage frappent Resend en même temps. L'adaptateur attend ce
 * qu'il demande, au plus trois essais, et le disjoncteur ne s'en émeut pas.
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

function rateLimited(retryAfter?: string): Reply {
  return {
    data: null,
    error: { message: "Too many requests", name: "rate_limit_exceeded", statusCode: 429 },
    headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
  };
}

/** Resend doublé : ses réponses tour à tour, et les clés qu'on lui a remises. */
function scriptedResend(...replies: readonly Reply[]): {
  client: ResendLike;
  keys: (string | undefined)[];
} {
  const keys: (string | undefined)[] = [];
  const client: ResendLike = {
    emails: {
      send: (_payload, options) => {
        keys.push(options?.idempotencyKey);
        const reply = replies[keys.length - 1];
        return reply === undefined
          ? Promise.reject(new RangeError("aucune réponse prévue"))
          : Promise.resolve(reply);
      },
    },
  };
  return { client, keys };
}

/** L'adaptateur, dont les attentes sont notées au lieu d'être attendues. */
function pacedMailer(client: ResendLike): {
  mailer: ResendMailer<TestMails>;
  waits: number[];
} {
  const waits: number[] = [];
  const mailer = new ResendMailer<TestMails>({
    client,
    registry,
    fromAddress: "LFC <noreply@lfc.fr>",
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  return { mailer, waits };
}

describe("les refus de cadence de Resend (429)", () => {
  it("un 429 puis un 200 : l'envoi part au second essai, même clé — un seul message", async () => {
    const { client, keys } = scriptedResend(rateLimited("2"), ACCEPTED);
    const { mailer, waits } = pacedMailer(client);

    await expect(mailer.send(HELLO)).resolves.toEqual({ providerId: "re_1" });

    expect(keys).toEqual(["hello:1", "hello:1"]);
    expect(waits).toEqual([2_000]);
  });

  it("trois 429 : trois essais, puis l'erreur du mailer", async () => {
    const { client, keys } = scriptedResend(rateLimited(), rateLimited(), rateLimited());
    const { mailer, waits } = pacedMailer(client);

    const refusal = mailer.send(HELLO);

    await expect(refusal).rejects.toBeInstanceOf(MailerSendError);
    await expect(refusal).rejects.toThrow("Resend a refusé l'envoi : Too many requests");
    expect(keys).toHaveLength(3);
    expect(waits).toEqual([1_000, 1_000]);
  });

  it("plafonne l'attente à trente secondes", async () => {
    const { client } = scriptedResend(rateLimited("600"), ACCEPTED);
    const { mailer, waits } = pacedMailer(client);

    await mailer.send(HELLO);

    expect(waits).toEqual([30_000]);
  });

  it("un autre refus ne se retente pas", async () => {
    const { client, keys } = scriptedResend({
      data: null,
      error: { message: "Adresse invalide", name: "validation_error", statusCode: 422 },
      headers: { "retry-after": "1" },
    });
    const { mailer, waits } = pacedMailer(client);

    await expect(mailer.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);
    await expect(mailer.send(HELLO)).rejects.not.toBeInstanceOf(MailerRateLimitedError);
    expect(keys).toHaveLength(2);
    expect(waits).toEqual([]);
  });

  it.each(["daily_quota_exceeded", "monthly_quota_exceeded"])(
    "un 429 de quota ne se retente pas (%s)",
    async (quota) => {
      const { client, keys } = scriptedResend({
        data: null,
        error: { message: "Quota exceeded", name: quota, statusCode: 429 },
        headers: { "retry-after": "1" },
      });
      const { mailer, waits } = pacedMailer(client);

      const refusal = mailer.send(HELLO);

      await expect(refusal).rejects.toBeInstanceOf(MailerSendError);
      await expect(refusal).rejects.not.toBeInstanceOf(MailerRateLimitedError);
      expect(keys).toHaveLength(1);
      expect(waits).toEqual([]);
    },
  );

  it("un 429 n'ouvre pas le disjoncteur : ce n'est pas une panne du fournisseur", async () => {
    const { client } = scriptedResend(rateLimited(), rateLimited(), rateLimited(), ACCEPTED);
    const { mailer } = pacedMailer(client);
    // Seuil à un : un seul échec compté suffirait à l'ouvrir.
    const breaker = new CircuitBreakerMailer<TestMails>(mailer, { threshold: 1, now: () => 0 });

    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerRateLimitedError);
    await expect(breaker.send(HELLO)).resolves.toEqual({ providerId: "re_1" });
  });
});
