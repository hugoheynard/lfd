import { AdminMailCheckController } from "../admin-mail-check.controller.js";
import { b2bMailTemplates } from "../mail-templates.js";
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
function configStub(fromAddress: string, admin: string, revision = "abc1234"): AppConfig {
  return {
    mailerConfig: () => ({ apiKey: null, fromAddress, replyTo: null, staffInbox: null }),
    bootstrapAdminEmail: () => admin,
    revision: () => revision,
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

    const result = await controller.check();

    expect(result.from).toBe("no-reply@exemple.test");
    expect(sent[0]?.data["fromAddress"]).toBe("no-reply@exemple.test");
  });

  it("écrit à l’admin de secours, sans réglage supplémentaire", async () => {
    const sent: SentMail[] = [];
    const controller = new AdminMailCheckController(
      mailerSpy(sent),
      configStub("no-reply@exemple.test", "dev@exemple.test"),
    );

    await controller.check();

    expect(sent[0]?.to).toBe("dev@exemple.test");
    expect(sent[0]?.template).toBe("ops.deploy-check");
  });

  it("porte la révision de L'IMAGE, pas celle qu'on lui souffle", async () => {
    // Une révision fournie par l'appelant pourrait désigner un déploiement que
    // ce container ne sert pas : l'e-mail attesterait d'une version qui ne l'a
    // pas envoyé, et le contrôle deviendrait un faux témoignage.
    const sent: SentMail[] = [];
    const controller = new AdminMailCheckController(
      mailerSpy(sent),
      configStub("no-reply@exemple.test", "dev@exemple.test", "deadbee"),
    );

    expect((await controller.check()).revision).toBe("deadbee");
    expect(sent[0]?.data["revision"]).toBe("deadbee");
  });

  it("REMONTE l’échec plutôt que de rendre un succès", async () => {
    // Sans ça, l'étape de déploiement passerait au vert avec un canal mort —
    // ce que ce contrôle existe précisément pour empêcher.
    const controller = new AdminMailCheckController(
      mailerSpy([], true),
      configStub("no-reply@exemple.test", "dev@exemple.test"),
    );

    await expect(controller.check()).rejects.toThrow();
  });
});

describe("le gabarit du contrôle", () => {
  it("nomme la révision et l’expéditeur dans ce qu’on reçoit", () => {
    const templates = b2bMailTemplates({
      supportEmail: "dev@exemple.test",
      backOfficeUrl: "https://admin.exemple.test",
    });
    const mail = templates["ops.deploy-check"]({
      revision: "abc1234",
      fromAddress: "no-reply@exemple.test",
    });

    expect(mail.subject).toContain("abc1234");
    expect(mail.html).toContain("no-reply@exemple.test");
  });
});
