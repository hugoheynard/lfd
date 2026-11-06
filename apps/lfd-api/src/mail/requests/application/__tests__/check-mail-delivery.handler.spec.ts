import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  OpenableUnitOfWork,
  RecordingMailRequests,
} from "../../../channels/requests/__tests__/recording-mail-requests.js";
import { CheckMailDeliveryHandler } from "../check-mail-delivery.handler.js";

/** La vraie configuration, dont seuls les trois réglages lus sont fixés. */
class Settings extends AppConfig {
  constructor(
    private readonly from: string,
    private readonly admin: string,
    private readonly stamped = "abc1234",
  ) {
    super();
  }
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), fromAddress: this.from };
  }
  override bootstrapAdminEmail(): string {
    return this.admin;
  }
  override revision(): string {
    return this.stamped;
  }
}

function setup(settings: Settings) {
  const mails = new RecordingMailRequests(new OpenableUnitOfWork());
  const handler = new CheckMailDeliveryHandler(mails, settings, new FixedIdGenerator());
  return { mails, handler };
}

/*
 * La sonde de déploiement du courrier, entrée dans le bloc `mail` au lot S2h
 * (plan `plan-service-e-mails.md`, § 18) : `sendNow`, jamais `request` —
 * le workflow lit l'issue, et un échec doit faire échouer le déploiement.
 */
describe("le contrôle de mise en service du courrier", () => {
  it("expédie depuis l'adresse CONFIGURÉE, jamais une adresse en dur, et sur-le-champ", async () => {
    // Le cœur du contrôle. Une adresse codée prouverait que le domaine marche,
    // pas que MAILER_FROM_ADDRESS est juste — un expéditeur cassé passerait.
    const { mails, handler } = setup(new Settings("no-reply@exemple.test", "admin@exemple.test"));

    const result = await handler.execute();

    expect(result).toEqual({
      sent: true,
      from: "no-reply@exemple.test",
      to: "admin@exemple.test",
      revision: "abc1234",
    });
    expect(mails.requested).toEqual([]);
    expect(mails.sentNow).toEqual([
      {
        brand: "lfc",
        to: "admin@exemple.test",
        template: "ops.deploy-check",
        data: { revision: "abc1234", fromAddress: "no-reply@exemple.test" },
        idempotencyKey: "ops.deploy-check:abc1234:id_000001",
      },
    ]);
  });

  it("porte la révision de L'IMAGE, pas celle qu'on lui souffle", async () => {
    const { mails, handler } = setup(
      new Settings("no-reply@exemple.test", "dev@exemple.test", "deadbee"),
    );

    expect((await handler.execute()).revision).toBe("deadbee");
    expect(mails.sentNow[0]?.data).toMatchObject({ revision: "deadbee" });
  });

  it("deux contrôles de la même révision font deux e-mails : une clé par appel", async () => {
    // Une clé par révision ferait rendre au bloc le reçu du premier envoi :
    // un second déploiement passerait au vert sans qu'aucun courrier parte.
    const { mails, handler } = setup(new Settings("no-reply@exemple.test", "dev@exemple.test"));

    await handler.execute();
    await handler.execute();

    expect(mails.sentNow.map((mail) => mail.idempotencyKey)).toEqual([
      "ops.deploy-check:abc1234:id_000001",
      "ops.deploy-check:abc1234:id_000002",
    ]);
  });

  it("REMONTE l'échec plutôt que de rendre un succès", async () => {
    // Sans ça, l'étape de déploiement passerait au vert avec un canal mort.
    const { mails, handler } = setup(new Settings("no-reply@exemple.test", "dev@exemple.test"));
    mails.failWith = new Error("Resend a refusé l'envoi");

    await expect(handler.execute()).rejects.toThrow("Resend a refusé l'envoi");
  });
});
