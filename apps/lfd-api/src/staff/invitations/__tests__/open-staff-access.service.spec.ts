import type { StaffStatus } from "@lfd/contracts";

import { RecordingJournal } from "../../../platform/journal/__tests__/recording-journal.js";
import { IdentitySubjectUnknownError } from "../../../platform/shared/errors/identity-errors.js";
import {
  RecordingAccessCache,
  TrackingUnitOfWork,
} from "../../directory/application/__tests__/staff-doubles.js";
import { STAFF_FACTS } from "../../directory/domain/staff-facts.js";
import { StaffIdentityPort } from "../staff-identity.port.js";
import { SuspendedStaffInviteError } from "../../directory/domain/staff-user-errors.js";
import type { StaffIdentityFacts } from "../../directory/domain/staff-user.repository.js";
import { OpenStaffAccess } from "../open-staff-access.service.js";
import type { MailReceipt } from "@lfd/mailer";
import type { MailDemand } from "../../../mail/channels/requests/mail-requests.js";
import { RecordingMailRequests } from "../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import type { B2bMails } from "../../../platform/mailer/mail-templates.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";

const NOW = new Date("2026-08-12T12:00:00.000Z");

/** Un `sub` que le fournisseur ne connaît plus : identité supprimée puis recréée. */
const DEAD_SUBJECT = "auth0|supprime";

function target(overrides: Partial<StaffIdentityFacts> = {}): StaffIdentityFacts {
  return {
    id: "s1",
    email: "sophie@lfc.test",
    firstName: "Sophie",
    lastName: "Martin",
    auth0Id: null,
    status: "pending" satisfies StaffStatus,
    ...overrides,
  };
}

interface Harness {
  readonly handler: OpenStaffAccess;
  readonly provisioned: string[];
  readonly relinked: string[];
  readonly marked: { id: string; subject: string; at: Date }[];
  readonly mails: { to: string; url: string }[];
  readonly journal: RecordingJournal;
  readonly cache: RecordingAccessCache;
  readonly requests: StaffMailRequests;
  /** Chaque `markInvited`, avec l'état de la transaction au moment de l'appel. */
  readonly markedInside: boolean[];
}

type Deps = ConstructorParameters<typeof OpenStaffAccess>;

/** Panne du fournisseur d'identité, pour éprouver l'ordre des opérations. */
class IdentityDown extends Error {
  constructor() {
    super("fournisseur indisponible");
  }
}

/**
 * La porte du bloc, qui note si chaque `sendNow` est arrivé hors transaction
 * et peut jouer le mailer « à blanc » (reçu sans identifiant de fournisseur).
 */
class StaffMailRequests extends RecordingMailRequests {
  readonly insideTransaction: boolean[] = [];

  constructor(
    private readonly tracking: TrackingUnitOfWork,
    private readonly blank: boolean,
  ) {
    super();
  }

  override async sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    this.insideTransaction.push(this.tracking.inside);
    const receipt = await super.sendNow(demand);
    return this.blank ? { providerId: null } : receipt;
  }
}

function harness(
  row: StaffIdentityFacts,
  identityFails = false,
  mailerOn = true,
  journalDown = false,
): Harness {
  const uow = new TrackingUnitOfWork();
  const journal = new RecordingJournal(journalDown ? new Error("journal en panne") : null);
  const cache = new RecordingAccessCache(uow);
  const markedInside: boolean[] = [];
  const provisioned: string[] = [];
  const relinked: string[] = [];
  const marked: { id: string; subject: string; at: Date }[] = [];

  const staff: Pick<Deps[0], "identityOf" | "markInvited"> = {
    identityOf: (): Promise<StaffIdentityFacts> => Promise.resolve(row),
    markInvited: (id: string, subject: string, at: Date): Promise<void> => {
      marked.push({ id, subject, at });
      markedInside.push(uow.inside);
      return Promise.resolve();
    },
  };
  const identities: Pick<StaffIdentityPort, "provision" | "issuePasswordLink" | "changeEmail"> = {
    changeEmail: (): Promise<void> => Promise.resolve(),
    provision: (input) => {
      if (identityFails) {
        return Promise.reject(new IdentityDown());
      }
      provisioned.push(input.email);
      return Promise.resolve({ subject: "auth0|neuf", passwordSetupUrl: "https://lien/neuf" });
    },
    issuePasswordLink: (subject) => {
      if (subject === DEAD_SUBJECT) {
        return Promise.reject(new IdentitySubjectUnknownError(subject));
      }
      if (identityFails) {
        return Promise.reject(new IdentityDown());
      }
      relinked.push(subject);
      return Promise.resolve("https://lien/renvoi");
    },
  };
  const requests = new StaffMailRequests(uow, !mailerOn);
  const handler = new OpenStaffAccess(
    staff as Deps[0],
    identities,
    { now: (): Date => NOW },
    requests,
    new FixedIdGenerator("geste"),
    journal,
    uow,
    cache,
  );
  return {
    handler,
    provisioned,
    relinked,
    marked,
    get mails(): { to: string; url: string }[] {
      return requests.sentNow.map((mail) => ({
        to: mail.to,
        url:
          typeof mail.data === "object" && mail.data !== null && "passwordSetupUrl" in mail.data
            ? String(mail.data.passwordSetupUrl)
            : "",
      }));
    },
    journal,
    cache,
    markedInside,
    requests,
  };
}

const SUBJECT = "s1";

describe("OpenStaffAccess — première invitation", () => {
  it("ouvre une identité, date l'invitation et envoie le lien", async () => {
    const h = harness(target());

    await h.handler.open(SUBJECT);

    expect(h.provisioned).toEqual(["sophie@lfc.test"]);
    expect(h.relinked).toEqual([]);
    expect(h.marked).toEqual([{ id: "s1", subject: "auth0|neuf", at: NOW }]);
    expect(h.mails).toEqual([{ to: "sophie@lfc.test", url: "https://lien/neuf" }]);
  });
});

describe("OpenStaffAccess — renvoi", () => {
  it("ne recrée pas d'identité quand elle existe déjà", async () => {
    // Le doublon d'identité est le vrai risque : deux `sub` pour une personne,
    // et le rapprochement d'annuaire devient un tirage au sort.
    const h = harness(target({ auth0Id: "auth0|deja", status: "invited" }));

    await h.handler.open(SUBJECT);

    expect(h.provisioned).toEqual([]);
    expect(h.relinked).toEqual(["auth0|deja"]);
    expect(h.mails).toEqual([{ to: "sophie@lfc.test", url: "https://lien/renvoi" }]);
  });

  it("renvoie aussi à quelqu'un déjà entré — c'est le mot de passe oublié", async () => {
    const h = harness(target({ auth0Id: "auth0|deja", status: "active" }));

    await h.handler.open(SUBJECT);

    expect(h.mails).toHaveLength(1);
  });
});

/**
 * Régression : depuis que l'accès staff ne relie plus une fiche liée par son
 * adresse (2026-09-17), la réinvitation est la seule sortie d'un `sub` refusé —
 * et elle rendait un 500 en réclamant un lien pour ce `sub`.
 */
describe("OpenStaffAccess — 🔴 la réinvitation relie à nouveau", () => {
  it("rouvre par l'adresse un `sub` que le fournisseur ne connaît plus", async () => {
    const h = harness(target({ auth0Id: DEAD_SUBJECT, status: "active" }));

    await h.handler.open(SUBJECT);

    expect(h.provisioned).toEqual(["sophie@lfc.test"]);
    expect(h.marked).toEqual([{ id: "s1", subject: "auth0|neuf", at: NOW }]);
    expect(h.mails).toEqual([{ to: "sophie@lfc.test", url: "https://lien/neuf" }]);
  });

  it("rouvre par l'adresse une fiche liée à un `sub` Google, sans lui demander de lien", async () => {
    const h = harness(target({ auth0Id: "google-oauth2|104233", status: "active" }));

    await h.handler.open(SUBJECT);

    expect(h.relinked).toEqual([]);
    expect(h.provisioned).toEqual(["sophie@lfc.test"]);
    expect(h.marked).toEqual([{ id: "s1", subject: "auth0|neuf", at: NOW }]);
  });
});

describe("OpenStaffAccess — suspendue", () => {
  it("refuse, sans toucher au fournisseur d'identité ni au courrier", async () => {
    // Un lien de mot de passe rouvrirait la porte que la suspension a fermée :
    // le suivre vaut entrée, et l'entrée réactive la fiche.
    const h = harness(target({ auth0Id: "auth0|deja", status: "suspended" }));

    await expect(h.handler.open(SUBJECT)).rejects.toBeInstanceOf(SuspendedStaffInviteError);

    expect(h.provisioned).toEqual([]);
    expect(h.relinked).toEqual([]);
    expect(h.marked).toEqual([]);
    expect(h.mails).toEqual([]);
  });
});

describe("OpenStaffAccess — ordre des opérations", () => {
  it("n'écrit pas « invitée » si le lien n'a pas pu être frappé", async () => {
    // Le lien d'abord, l'écriture ensuite. L'ordre inverse laisserait une fiche
    // qui annonce une invitation que personne n'a reçue, et l'administrateur
    // attendrait une réponse à un e-mail jamais parti.
    const h = harness(target(), true);

    await expect(h.handler.open(SUBJECT)).rejects.toBeInstanceOf(IdentityDown);

    expect(h.marked).toEqual([]);
    expect(h.mails).toEqual([]);
  });
});

describe("OpenStaffAccess — ce que l'écran a le droit d'annoncer", () => {
  it("dit que l'e-mail est parti quand le canal est ouvert", async () => {
    const h = harness(target());

    await expect(h.handler.open(SUBJECT)).resolves.toEqual({ mailSent: true });
  });

  it("dit qu'il n'est PAS parti quand le mailer tourne à blanc", async () => {
    // Sans clé, le mailer rend le gabarit, le journalise et n'envoie rien : il
    // ne lève donc pas. Rendre `void` faisait annoncer « lien envoyé » à
    // quelqu'un qui n'attendrait jamais rien — le lien se remet alors à la main.
    const h = harness(target(), false, false);

    await expect(h.handler.open(SUBJECT)).resolves.toEqual({ mailSent: false });
  });
});

describe("OpenStaffAccess — la trace de l'invitation", () => {
  it("écrit `markInvited` ET le fait ensemble, puis oublie le cache après le commit", async () => {
    const h = harness(target());

    await h.handler.open(SUBJECT);

    expect(h.markedInside).toEqual([true]);
    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.invited,
        subjectType: "staff_user",
        subjectId: "s1",
        // Ni l'adresse, ni le lien : le lien vaut prise de contrôle du compte.
        payload: {
          subjectLabel: "Sophie Martin",
          person: { firstName: "Sophie", lastName: "Martin" },
          kind: "invitation",
        },
      },
    ]);
    expect(h.cache.forgotten).toEqual([{ insideTransaction: false }]);
  });

  it("dit « mot de passe » quand la personne est déjà entrée", async () => {
    const h = harness(target({ auth0Id: "auth0|deja", status: "active" }));

    await h.handler.open(SUBJECT);

    expect(h.journal.facts[0]?.payload).toMatchObject({ kind: "password_reset" });
  });

  /**
   * Jamais un e-mail envoyé derrière un 500 : si la trace ne s'écrit pas,
   * l'invitation n'a pas eu lieu, et un nouvel essai frappera un lien neuf.
   */
  it("n'envoie AUCUN e-mail quand le journal tombe", async () => {
    const h = harness(target(), false, true, true);

    await expect(h.handler.open(SUBJECT)).rejects.toThrow("journal en panne");

    expect(h.mails).toEqual([]);
    expect(h.cache.forgotten).toEqual([]);
  });
});

describe("OpenStaffAccess — par le bloc `mail` (S2g)", () => {
  it("envoie en `sendNow`, HORS transaction, avec une clé par geste sans adresse", async () => {
    const h = harness(target());

    await h.handler.open(SUBJECT);

    expect(h.requests.requested).toEqual([]);
    expect(h.requests.insideTransaction).toEqual([false]);
    expect(h.requests.sentNow).toEqual([
      {
        brand: "lfc",
        to: "sophie@lfc.test",
        template: "staff.invited",
        idempotencyKey: "staff.invited:s1:geste_000001",
        data: { firstName: "Sophie", passwordSetupUrl: "https://lien/neuf" },
      },
    ]);
  });

  it("un renvoi a une clé neuve : le bloc ne le tait pas", async () => {
    // Le bloc garde une clé un an : une clé fixe par personne aurait rendu le
    // reçu du premier lien sans envoyer le second, qui est un lien NEUF.
    const h = harness(target({ auth0Id: "auth0|deja", status: "active" }));

    await h.handler.open(SUBJECT);
    await h.handler.open(SUBJECT);

    expect(h.requests.sentNow.map((mail) => mail.idempotencyKey)).toEqual([
      "staff.password-reset:s1:geste_000001",
      "staff.password-reset:s1:geste_000002",
    ]);
  });

  it("un envoi refusé ne défait pas l'ouverture : l'écran lit « non envoyé »", async () => {
    const h = harness(target());
    h.requests.failWith = new Error("Resend refuse");

    await expect(h.handler.open(SUBJECT)).resolves.toEqual({ mailSent: false });
    expect(h.marked).toHaveLength(1);
  });
});
