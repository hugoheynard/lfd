import type { MailCopyOverlay } from "../../../templates/copy/mail-copy-overlay.js";
import { PublishedMailCopyReader } from "../../../templates/effective-copy/published-mail-copy.reader.js";
import type { PublishedMailCharters } from "../../../templates/effective-copy/published-mail-charters.js";
import type { PublishedMailDocuments } from "../../../templates/effective-copy/published-mail-documents.js";
import type {
  PublishedMailSenders,
  PublishedMailSendersByNature,
} from "../../../templates/effective-copy/published-mail-senders.js";
import type { MailSectionOrders } from "../../../templates/sections/mail-layout-scope.js";
import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../channels/requests/__tests__/recording-mail.js";
import { FixedWallClock } from "../../../../platform/time/fixed-wall-clock.js";
import { MailRequest } from "../../domain/entities/mail-request.js";
import {
  DeferredMailCheckFailedError,
  DeferredMailCheckTimeoutError,
} from "../../domain/errors/deferred-mail-check.errors.js";
import { Pause } from "../../domain/ports/pause.js";
import { CheckMailDeliveryHandler } from "../check-mail-delivery.handler.js";
import {
  DEFERRED_CHECK_POLL_MS,
  DEFERRED_CHECK_TIMEOUT_MS,
  DeferredMailCheck,
} from "../deferred-mail-check.service.js";
import { InMemoryMailRequests, RecordingFacts } from "./mail-doubles.js";

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

const WALL_START = new Date("2026-11-07T10:00:00.000Z");

/** Ce que la boîte d'envoi fait de la demande différée, attente après attente. */
type Relay = "sends" | "stalls" | "fails";

/**
 * L'attente, doublée : elle avance l'horloge du mur au lieu d'attendre, et
 * joue le relais — la demande différée passe `sent`, échoue, ou reste.
 */
class RelayingPause extends Pause {
  waits = 0;
  constructor(
    private readonly wall: FixedWallClock,
    private readonly requests: InMemoryMailRequests,
    private readonly mails: RecordingMail,
    private readonly relay: Relay,
  ) {
    super();
  }

  async wait(ms: number): Promise<void> {
    this.waits += 1;
    this.wall.advanceMs(ms);
    const demand = this.mails.queued.at(-1);
    if (demand === undefined || (await this.requests.findByIdempotencyKey(demand.idempotencyKey))) {
      return this.settle(demand?.idempotencyKey);
    }
    const request = MailRequest.request({
      id: "mail_1",
      template: demand.template,
      brand: "lfd",
      recipient: demand.to,
      locale: null,
      idempotencyKey: demand.idempotencyKey,
      requestedAt: WALL_START,
    });
    await this.requests.save(request);
    return this.settle(demand.idempotencyKey);
  }

  private async settle(key: string | undefined): Promise<void> {
    const request = key === undefined ? null : await this.requests.findByIdempotencyKey(key);
    if (request === null || this.relay === "stalls") {
      return;
    }
    if (this.relay === "sends") {
      request.markSent("re_deferred", this.wall.elapsedNow());
    } else {
      request.markFailed("Resend : clé refusée", this.wall.elapsedNow());
    }
    await this.requests.save(request);
  }
}

/** Les identités d'envoi rangées, telles que l'envoi les lit (C3) ; le reste est vide. */
class PublishedSenders extends PublishedMailCopyReader {
  constructor(private readonly identities: PublishedMailSenders) {
    super();
  }
  senders(): Promise<PublishedMailSendersByNature> {
    return Promise.resolve({ transactional: this.identities, marketing: {} });
  }
  read(): Promise<MailCopyOverlay> {
    return Promise.resolve({});
  }
  sectionOrders(): Promise<MailSectionOrders> {
    return Promise.resolve({});
  }
  documents(): Promise<PublishedMailDocuments> {
    return Promise.resolve({});
  }
  charters(): Promise<PublishedMailCharters> {
    return Promise.resolve({});
  }
}

function setup(settings: Settings, relay: Relay = "sends", identities?: PublishedMailSenders) {
  const unitOfWork = new OpenableUnitOfWork();
  const mails = new RecordingMail(unitOfWork);
  const requests = new InMemoryMailRequests(new RecordingFacts());
  const wall = new FixedWallClock(WALL_START);
  const pause = new RelayingPause(wall, requests, mails, relay);
  const deferred = new DeferredMailCheck(mails, unitOfWork, requests, wall, pause);
  const handler = new CheckMailDeliveryHandler(
    mails,
    settings,
    new FixedIdGenerator(),
    deferred,
    identities === undefined ? undefined : new PublishedSenders(identities),
  );
  return { mails, handler, pause };
}

/*
 * La sonde de déploiement du courrier, entrée dans le bloc `mail` au lot S2h
 * (plan `plan-service-e-mails.md`, § 18) : `sendAndAwaitReceipt`, jamais `send` —
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
      immediate: "sent",
      deferred: "sent",
      from: "no-reply@exemple.test",
      to: "admin@exemple.test",
      revision: "abc1234",
      senderSpaces: [],
    });
    expect(mails.awaitedReceipt).toEqual([
      {
        to: "admin@exemple.test",
        template: "ops.deploy-check",
        data: { revision: "abc1234", fromAddress: "no-reply@exemple.test" },
        idempotencyKey: "ops.deploy-check:abc1234:id_000001",
      },
    ]);
  });

  it("éprouve l'identité de chaque espace qui en a une (C3)", async () => {
    const lfd = {
      senderName: "La Folie Douce",
      fromAddress: "no-reply@lfd.test",
      replyToAddress: null,
    };
    const lfc = {
      senderName: "La Folie Coffee",
      fromAddress: "bonjour@lfc.test",
      replyToAddress: null,
    };
    const { mails, handler } = setup(
      new Settings("no-reply@exemple.test", "admin@exemple.test"),
      "sends",
      {
        lfd: { kind: "servable", identity: lfd },
        lfc: { kind: "servable", identity: lfc },
      },
    );

    const result = await handler.execute();

    expect(result).toMatchObject({
      from: '"La Folie Douce" <no-reply@lfd.test>',
      senderSpaces: ["lfc", "lfd"],
    });
    expect(mails.awaitedReceipt.map((mail) => [mail.idempotencyKey, mail.data])).toEqual([
      [
        "ops.deploy-check:abc1234:id_000001",
        { revision: "abc1234", fromAddress: '"La Folie Douce" <no-reply@lfd.test>' },
      ],
      [
        "ops.deploy-check:abc1234:id_000001:lfc",
        { revision: "abc1234", fromAddress: '"La Folie Coffee" <bonjour@lfc.test>' },
      ],
    ]);
  });

  it("porte la révision de L'IMAGE, pas celle qu'on lui souffle", async () => {
    const { mails, handler } = setup(
      new Settings("no-reply@exemple.test", "dev@exemple.test", "deadbee"),
    );

    expect((await handler.execute()).revision).toBe("deadbee");
    expect(mails.awaitedReceipt[0]?.data).toMatchObject({ revision: "deadbee" });
  });

  it("deux contrôles de la même révision font deux e-mails : une clé par appel", async () => {
    // Une clé par révision ferait rendre au bloc le reçu du premier envoi :
    // un second déploiement passerait au vert sans qu'aucun courrier parte.
    const { mails, handler } = setup(new Settings("no-reply@exemple.test", "dev@exemple.test"));

    await handler.execute();
    await handler.execute();

    expect(mails.awaitedReceipt.map((mail) => mail.idempotencyKey)).toEqual([
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

  /*
   * Lot S8 (plan § 25) : la sonde éprouve aussi l'envoi DIFFÉRÉ — demande dans
   * une unité de travail, boîte d'envoi, relais, abonné. Un déploiement vert
   * avec un courrier client resté « demandé » était possible avant.
   */
  describe("l'envoi différé", () => {
    it("demande par `send`, DANS une unité de travail, avec une clé dérivée de l'appel", async () => {
      const { mails, handler } = setup(new Settings("no-reply@exemple.test", "dev@exemple.test"));

      await handler.execute();

      expect(mails.queued).toEqual([
        {
          to: "dev@exemple.test",
          template: "ops.deploy-check",
          data: { revision: "abc1234", fromAddress: "no-reply@exemple.test" },
          idempotencyKey: "ops.deploy-check:abc1234:id_000001:deferred",
        },
      ]);
    });

    it("envoyé à temps : le contrôle passe, après une relecture", async () => {
      const { handler, pause } = setup(new Settings("a@exemple.test", "b@exemple.test"), "sends");

      await expect(handler.execute()).resolves.toMatchObject({ deferred: "sent" });
      expect(pause.waits).toBe(1);
    });

    it("resté `requested` : erreur nommée au bout du délai, pas avant", async () => {
      const { handler, pause } = setup(new Settings("a@exemple.test", "b@exemple.test"), "stalls");

      const failure = handler.execute();

      await expect(failure).rejects.toBeInstanceOf(DeferredMailCheckTimeoutError);
      await expect(failure).rejects.toThrow(
        "L'e-mail différé de contrôle est resté « requested » après 75 s",
      );
      expect(pause.waits).toBe(DEFERRED_CHECK_TIMEOUT_MS / DEFERRED_CHECK_POLL_MS);
    });

    it("passé `failed` : erreur nommée SANS attendre la fin du délai", async () => {
      const { handler, pause } = setup(new Settings("a@exemple.test", "b@exemple.test"), "fails");

      await expect(handler.execute()).rejects.toBeInstanceOf(DeferredMailCheckFailedError);
      expect(pause.waits).toBe(1);
    });
  });
});
