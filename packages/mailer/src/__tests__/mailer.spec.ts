import { CircuitBreakerMailer } from "../circuit-breaker.js";
import { createMailer } from "../create-mailer.js";
import { DryRunMailer } from "../dry-run-mailer.js";
import { MailerCircuitOpenError, MailerSendError } from "../errors.js";
import { htmlEscape, renderLayout, sanitiseSubject } from "../html.js";
import { ResendMailer, type ResendLike } from "../resend-mailer.js";
import type { Mailer, SendMailArgs, TemplateRegistry } from "../types.js";

/** La carte d'une app fictive — c'est tout ce que le paquet sait des gabarits. */
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
};

/** Un double de Resend : on capte l'appel, on décide de la réponse. */
function fakeResend(reply: Awaited<ReturnType<ResendLike["emails"]["send"]>> | Error): {
  client: ResendLike;
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  const client: ResendLike = {
    emails: {
      send: (payload, options) => {
        calls.push([payload, options]);
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    },
  };
  return { client, calls };
}

const ACCEPTED = { data: { id: "re_1" }, error: null };

describe("le rendu", () => {
  it("échappe ce qui pourrait injecter du HTML", () => {
    expect(htmlEscape(`<script>"x"&'y'`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
  });

  it("retire les retours à la ligne d'un objet — sinon on injecte des en-têtes", () => {
    expect(sanitiseSubject("Devis\r\nBcc: victime@exemple.fr")).toBe(
      "Devis Bcc: victime@exemple.fr",
    );
  });

  it("échappe le corps ET le lien du bouton dans la coquille", () => {
    const html = renderLayout({
      title: "T",
      body: "<b>gras</b>",
      cta: { label: "Voir", url: "https://lfc.fr/a?b=1&c=2" },
    });
    expect(html).toContain("&lt;b&gt;gras&lt;/b&gt;");
    expect(html).toContain("https://lfc.fr/a?b=1&amp;c=2");
  });

  it("n'affiche PAS de bouton sur un schéma hostile", () => {
    const html = renderLayout({
      title: "T",
      body: "b",
      cta: { label: "Cliquez", url: "javascript:alert(1)" },
    });
    expect(html).not.toContain("Cliquez");
  });
});

describe("le mode à blanc", () => {
  it("ne délivre rien, et le dit", async () => {
    const mailer = new DryRunMailer<TestMails>(registry);
    expect(mailer.enabled).toBe(false);
    await expect(mailer.send(HELLO)).resolves.toBeUndefined();
  });

  it("rend QUAND MÊME le gabarit — une erreur de gabarit se voit en local", () => {
    const boom: TemplateRegistry<TestMails> = {
      "test.hello": () => {
        throw new Error("gabarit cassé");
      },
    };
    expect(() => new DryRunMailer<TestMails>(boom).send(HELLO)).toThrow("gabarit cassé");
  });
});

describe("l'adaptateur Resend", () => {
  it("transmet expéditeur, destinataire, objet et HTML rendus", async () => {
    const { client, calls } = fakeResend(ACCEPTED);
    await new ResendMailer<TestMails>({
      client,
      registry,
      fromAddress: "commande@lfc.fr",
      replyTo: "contact@lfc.fr",
    }).send(HELLO);

    expect(calls[0]?.[0]).toMatchObject({
      from: "commande@lfc.fr",
      to: "client@exemple.fr",
      subject: "Bonjour Camille",
      replyTo: "contact@lfc.fr",
    });
  });

  it("transmet la clé d'idempotence — une reprise ne doit pas envoyer deux fois", async () => {
    const { client, calls } = fakeResend(ACCEPTED);
    await new ResendMailer<TestMails>({ client, registry, fromAddress: "a@b.fr" }).send({
      ...HELLO,
      idempotencyKey: "appt_1",
    });
    expect(calls[0]?.[1]).toEqual({ idempotencyKey: "appt_1" });
  });

  it("traduit un REFUS du fournisseur en MailerSendError", async () => {
    const { client } = fakeResend({ data: null, error: { message: "domaine non vérifié" } });
    const mailer = new ResendMailer<TestMails>({ client, registry, fromAddress: "a@b.fr" });
    await expect(mailer.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);
  });

  it("traduit une panne RÉSEAU en la même erreur — un seul cas à traiter", async () => {
    const { client } = fakeResend(new Error("ECONNRESET"));
    const mailer = new ResendMailer<TestMails>({ client, registry, fromAddress: "a@b.fr" });
    await expect(mailer.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);
  });
});

describe("le disjoncteur", () => {
  /** Un mailer qui échoue à volonté, et qui compte ses appels. */
  function flaky(): {
    mailer: Mailer<TestMails>;
    setFailing: (v: boolean) => void;
    calls: () => number;
  } {
    let failing = true;
    let calls = 0;
    return {
      mailer: {
        enabled: true,
        send: (): Promise<void> => {
          calls += 1;
          return failing ? Promise.reject(new MailerSendError("nope")) : Promise.resolve();
        },
      },
      setFailing: (v) => {
        failing = v;
      },
      calls: () => calls,
    };
  }

  it("ouvre après le seuil, et cesse alors d'appeler le fournisseur", async () => {
    const inner = flaky();
    const now = 0;
    const breaker = new CircuitBreakerMailer<TestMails>(inner.mailer, {
      threshold: 2,
      cooldownMs: 1_000,
      now: () => now,
    });

    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);
    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);
    expect(inner.calls()).toBe(2);

    // Ouvert : on échoue vite, SANS appeler le fournisseur.
    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerCircuitOpenError);
    expect(inner.calls()).toBe(2);
  });

  it("autorise un essai après le délai, et se referme si le fournisseur est revenu", async () => {
    const inner = flaky();
    let now = 0;
    const breaker = new CircuitBreakerMailer<TestMails>(inner.mailer, {
      threshold: 1,
      cooldownMs: 1_000,
      now: () => now,
    });
    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);

    now = 1_500;
    inner.setFailing(false);
    await expect(breaker.send(HELLO)).resolves.toBeUndefined();

    // Refermé : un échec isolé ne rouvre pas immédiatement.
    inner.setFailing(true);
    await expect(breaker.send(HELLO)).rejects.toBeInstanceOf(MailerSendError);
  });
});

describe("la fabrique", () => {
  it("part à blanc sans clé — un oubli ne démarre pas un envoi réel", () => {
    expect(createMailer({ registry, fromAddress: "a@b.fr" }).enabled).toBe(false);
    expect(createMailer({ apiKey: "   ", registry, fromAddress: "a@b.fr" }).enabled).toBe(false);
  });

  it("branche le vrai fournisseur dès qu'une clé est là", () => {
    expect(createMailer({ apiKey: "re_test", registry, fromAddress: "a@b.fr" }).enabled).toBe(true);
  });
});
