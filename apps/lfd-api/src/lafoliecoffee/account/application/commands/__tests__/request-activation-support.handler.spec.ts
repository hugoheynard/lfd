import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../../platform/journal/journal-fact.js";
import type { ActivationSupportPayload } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SupportRequestedEvent } from "../../../domain/events/support-requested.event.js";

import {
  CompanyNotFoundError,
  OpenSupportRequestExistsError,
} from "../../../domain/errors/account-errors.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import { SupportRequestRepository } from "../../../domain/ports/support-request.repository.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { RequestActivationSupportCommand } from "../request-activation-support.command.js";
import { RequestActivationSupportHandler } from "../request-activation-support.handler.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { SupportRequestedMail } from "../../services/support-requested-mail.service.js";
import { OneRequest, REQUEST, Settings } from "../../services/__tests__/support-request-doubles.js";
import { journalNames } from "./member-acts-doubles.js";

const PAYLOAD: ActivationSupportPayload = {
  companyId: "company_1",
  channel: "email",
  purpose: "discover",
  phoneNumber: "",
  asap: true,
  scheduledDate: null,
  slot: null,
  message: "",
};

function memberships(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) } satisfies MembershipReader;
}

function supportRepo(hasOpen: boolean, recorder?: { recorded: number }): SupportRequestRepository {
  return {
    hasOpenRequest: () => Promise.resolve(hasOpen),
    record: () => {
      if (recorder !== undefined) {
        recorder.recorded += 1;
      }
      return Promise.resolve("support_1");
    },
    list: () => Promise.resolve([]),
    markHandled: () =>
      Promise.resolve({ companyId: "company_1", requestedByUserId: "user_1", newlyHandled: true }),
  } satisfies SupportRequestRepository;
}

/** Publieur doublé : on capture ce qui est publié best-effort ; la trace n'est pas attendue. */
class CapturingPublisher extends DomainEventPublisher {
  constructor(private readonly published: unknown[]) {
    super();
  }

  publish(event: object): void {
    this.published.push(event);
  }

  publishTraced(_event: JournaledEvent): Promise<void> {
    return Promise.reject(new Error("non appelé : la demande de support est best-effort"));
  }
}

function eventBus(published: unknown[]): DomainEventPublisher {
  return new CapturingPublisher(published);
}

const CLOCK = new FixedClock(new Date("2026-06-01T08:00:00.000Z"));

/** L'unité de travail et le courriel, pour les cas qui ne les regardent pas. */
function wiring(): [OpenableUnitOfWork, SupportRequestedMail] {
  const uow = new OpenableUnitOfWork();
  return [uow, staffMail(uow).mail];
}

/** Le courriel à l'équipe, sur la porte doublée : `send` refusé hors transaction. */
function staffMail(uow: OpenableUnitOfWork, mails = new RecordingMail(uow)) {
  const stored = { ...REQUEST, id: "support_1" };
  return {
    mails,
    mail: new SupportRequestedMail(new OneRequest(stored), mails, new Settings("equipe@lfc.fr")),
  };
}

describe("RequestActivationSupportHandler", () => {
  it("enregistre la demande d'un membre sans demande ouverte", async () => {
    const recorder = { recorded: 0 };
    const published: unknown[] = [];
    const handler = new RequestActivationSupportHandler(
      memberships("orders"),
      supportRepo(false, recorder),
      eventBus(published),
      CLOCK,
      journalNames(),
      ...wiring(),
    );

    const id = await handler.execute(new RequestActivationSupportCommand("user_1", PAYLOAD));

    expect(id).toBe("support_1");
    expect(recorder.recorded).toBe(1);
    // Le journal capte le dépôt : c'est lui qui, avec la clôture, donnera le
    // délai de traitement de la file.
    expect(published).toEqual([
      new SupportRequestedEvent(
        "support_1",
        "company_1",
        "user_1",
        // Le nom de la société au moment de la demande (lot B du plan des phrases).
        "Le Pain Quotidien",
        "email",
        CLOCK.now(),
      ),
    ]);
  });

  it("refuse (409) si une demande est déjà ouverte", async () => {
    const recorder = { recorded: 0 };
    const handler = new RequestActivationSupportHandler(
      memberships("orders"),
      supportRepo(true, recorder),
      eventBus([]),
      CLOCK,
      journalNames(),
      ...wiring(),
    );

    await expect(
      handler.execute(new RequestActivationSupportCommand("user_1", PAYLOAD)),
    ).rejects.toBeInstanceOf(OpenSupportRequestExistsError);
    expect(recorder.recorded).toBe(0);
  });

  it("refuse (404 non-divulguant) un non-membre", async () => {
    const handler = new RequestActivationSupportHandler(
      memberships(null),
      supportRepo(false),
      eventBus([]),
      CLOCK,
      journalNames(),
      ...wiring(),
    );

    await expect(
      handler.execute(new RequestActivationSupportCommand("user_x", PAYLOAD)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("n'interroge AUCUN mur quand la demande ne désigne pas de société", async () => {
    // Le prospect sans entreprise déclarée ne peut pas être « membre » de quoi
    // que ce soit : consulter les memberships ici le bloquerait pour toujours.
    const memberships = {
      roleOf: () => Promise.reject(new Error("le mur ne doit pas être interrogé")),
    } satisfies MembershipReader;
    const published: unknown[] = [];
    const handler = new RequestActivationSupportHandler(
      memberships,
      supportRepo(false),
      eventBus(published),
      CLOCK,
      journalNames(),
      ...wiring(),
    );

    const id = await handler.execute(
      new RequestActivationSupportCommand("u1", { ...PAYLOAD, companyId: null }),
    );

    expect(id).toBe("support_1");
    // Le journal porte alors sur la PERSONNE — le sujet suit la demande, et
    // c'est elle qu'il nomme.
    expect(published).toEqual([
      new SupportRequestedEvent("support_1", null, "u1", "Camille Rousseau", "email", CLOCK.now()),
    ]);
  });

  /**
   * S2b (2026-11-06) : le courriel à l'équipe est DEMANDÉ au bloc `mail` dans
   * la transaction du dépôt — il était envoyé en fond par un abonné en
   * mémoire, perdu à un redémarrage.
   */
  it("demande le courriel à l'équipe dans la transaction du dépôt", async () => {
    const uow = new OpenableUnitOfWork();
    const { mails, mail } = staffMail(uow);
    const handler = new RequestActivationSupportHandler(
      memberships("orders"),
      supportRepo(false),
      eventBus([]),
      CLOCK,
      journalNames(),
      uow,
      mail,
    );

    await handler.execute(new RequestActivationSupportCommand("user_1", PAYLOAD));

    expect(mails.queued.map((m) => [m.template, m.idempotencyKey])).toEqual([
      ["staff.support-requested", "mail:support.requested:support_1"],
    ]);
  });

  it("échoue, sans rien publier, quand la demande d'e-mail est refusée", async () => {
    const uow = new OpenableUnitOfWork();
    const mails = new RecordingMail(uow);
    mails.failWith = new Error("base indisponible");
    const published: unknown[] = [];
    const handler = new RequestActivationSupportHandler(
      memberships("orders"),
      supportRepo(false),
      eventBus(published),
      CLOCK,
      journalNames(),
      uow,
      staffMail(uow, mails).mail,
    );

    await expect(
      handler.execute(new RequestActivationSupportCommand("user_1", PAYLOAD)),
    ).rejects.toThrow("base indisponible");
    expect(published).toEqual([]);
  });
});
