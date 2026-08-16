import { AdminMailCheckController } from "../admin-mail-check.controller.js";
import { B2B_MAIL_TEMPLATES } from "../mail-templates.js";
import type { AppConfig } from "../../config/app-config.js";
import type { B2bMailer } from "../mailer.tokens.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Un mailer double qui retient ce qu'on lui a demandé d'envoyer. */
function mailerSpy(sent: SentMail[], fail = false): B2bMailer {
  return {
    enabled: true,
    send: (args) => {
      if (fail) {
        return Promise.reject(new Error("Resend a refusé l'envoi"));
      }
      sent.push({ to: args.to, template: String(args.template), data: { ...args.data } });
      return Promise.resolve();
    },
  };
}

/** La configuration réduite à ce que le contrôleur lit. */
function configStub(fromAddress: string, admin: string): AppConfig {
  return {
    mailerConfig: () => ({ apiKey: null, fromAddress, replyTo: null, staffInbox: null }),
    bootstrapAdminEmail: () => admin,
  } as AppConfig;
}

describe("le contrôle de mise en service du courrier", () => {
  it("expédie depuis l’adresse CONFIGURÉE, jamais une adresse en dur", async () => {
    // Le cœur du contrôle. Une adresse codée dans le contrôleur prouverait que
    // le domaine marche, pas que MAILER_FROM_ADDRESS est juste — et laisserait
    // passer un expéditeur de production cassé.
    const sent: SentMail[] = [];
    const controller = new AdminMailCheckController(
      mailerSpy(sent),
      configStub("no-reply@exemple.test", "admin@exemple.test"),
    );

    const result = await controller.check({ revision: "abc1234" });

    expect(result.from).toBe("no-reply@exemple.test");
    expect(sent[0]?.data["fromAddress"]).toBe("no-reply@exemple.test");
  });

  it("écrit à l’admin de secours, sans réglage supplémentaire", async () => {
    const sent: SentMail[] = [];
    const controller = new AdminMailCheckController(
      mailerSpy(sent),
      configStub("no-reply@exemple.test", "dev@exemple.test"),
    );

    await controller.check({});

    expect(sent[0]?.to).toBe("dev@exemple.test");
    expect(sent[0]?.template).toBe("ops.deploy-check");
  });

  it("porte la révision, et le dit quand elle manque", async () => {
    const sent: SentMail[] = [];
    const controller = new AdminMailCheckController(
      mailerSpy(sent),
      configStub("no-reply@exemple.test", "dev@exemple.test"),
    );

    expect((await controller.check({ revision: "  deadbee  " })).revision).toBe("deadbee");
    // Une révision absente ne doit pas produire un objet d'e-mail tronqué.
    expect((await controller.check({})).revision).toBe("révision inconnue");
  });

  it("REMONTE l’échec plutôt que de rendre un succès", async () => {
    // Sans ça, l'étape de déploiement passerait au vert avec un canal mort —
    // ce que ce contrôle existe précisément pour empêcher.
    const controller = new AdminMailCheckController(
      mailerSpy([], true),
      configStub("no-reply@exemple.test", "dev@exemple.test"),
    );

    await expect(controller.check({})).rejects.toThrow();
  });
});

describe("le gabarit du contrôle", () => {
  it("nomme la révision et l’expéditeur dans ce qu’on reçoit", () => {
    const mail = B2B_MAIL_TEMPLATES["ops.deploy-check"]({
      revision: "abc1234",
      fromAddress: "no-reply@exemple.test",
    });

    expect(mail.subject).toContain("abc1234");
    expect(mail.html).toContain("no-reply@exemple.test");
  });
});
