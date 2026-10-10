import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  CustomerIdentityPort,
  type LoginMethod,
  type ProvisionedIdentity,
} from "../../../domain/ports/customer-identity.port.js";
import { PendingAccessNotFoundError } from "../../../domain/errors/account-errors.js";
import { PendingInvitationNotFoundError } from "../../../domain/errors/invitation-errors.js";
import { PendingAccessReader } from "../../../domain/ports/pending-access.reader.js";
import { IssuePasswordLinkCommand } from "../issue-password-link.command.js";
import { IssuePasswordLinkHandler } from "../issue-password-link.handler.js";
import { journalNames, RecordingRenewal } from "./member-acts-doubles.js";

function reader(subject: string | null): PendingAccessReader {
  return {
    list: () => Promise.resolve([]),
    subjectOf: () => Promise.resolve(subject),
  };
}

/**
 * Fournisseur d'identité doublé : seul `issuePasswordLink` est attendu ; tout
 * autre geste échoue, ce qui ferait rougir le test s'il était appelé.
 */
class IssuingIdentity extends CustomerIdentityPort {
  constructor(
    private readonly url: string,
    private readonly issued: string[],
  ) {
    super();
  }

  issuePasswordLink(subject: string): Promise<string> {
    this.issued.push(subject);
    return Promise.resolve(this.url);
  }

  changeEmail(): Promise<void> {
    return Promise.reject(new Error("non appelé"));
  }

  provision(): Promise<ProvisionedIdentity> {
    return Promise.reject(new Error("non appelé"));
  }

  sendPasswordResetLink(): Promise<void> {
    return Promise.reject(new Error("non appelé"));
  }

  listLoginMethods(): Promise<readonly LoginMethod[]> {
    return Promise.reject(new Error("non appelé"));
  }

  linkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.reject(new Error("non appelé"));
  }

  unlinkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.reject(new Error("non appelé"));
  }
}

function identity(url: string, issued: string[] = []): CustomerIdentityPort {
  return new IssuingIdentity(url, issued);
}

describe("fabriquer un lien à remettre à la main", () => {
  it("en fabrique un NEUF pour la personne qui attend", async () => {
    // On n'en retrouve pas un : un lien est à usage unique et daté. Ressortir
    // celui de l'ouverture rendrait un lien mort trois semaines plus tard.
    const issued: string[] = [];
    const handler = new IssuePasswordLinkHandler(
      reader("auth0|abc"),
      identity("https://auth/ticket-neuf", issued),
      { now: () => new Date("2026-08-14T09:00:00.000Z") },
      new RecordingPublisher(),
      journalNames(),
      new RecordingRenewal(),
    );

    const link = await handler.execute(new IssuePasswordLinkCommand("usr_1"));

    expect(link.url).toBe("https://auth/ticket-neuf");
    expect(issued).toEqual(["auth0|abc"]);
    // Sept jours : l'écran ne devine pas l'échéance, le serveur la donne.
    expect(link.expiresAt).toBe("2026-08-21T09:00:00.000Z");
  });

  it("REFUSE pour quelqu'un qui n'attend plus", async () => {
    // Le cas fréquent : la personne a posé son mot de passe entre l'affichage
    // de la file et le clic. Lui fabriquer un lien reviendrait à offrir de quoi
    // le réinitialiser sans qu'elle ait rien demandé.
    const issued: string[] = [];
    const handler = new IssuePasswordLinkHandler(
      reader(null),
      identity("https://auth/x", issued),
      { now: () => new Date("2026-08-14T09:00:00.000Z") },
      new RecordingPublisher(),
      journalNames(),
      new RecordingRenewal(),
    );

    await expect(handler.execute(new IssuePasswordLinkCommand("usr_1"))).rejects.toThrow(
      PendingAccessNotFoundError,
    );
    expect(issued).toEqual([]);
  });
});

describe("le lien remis renouvelle l'invitation d'UNE société (§8.1 bis, point 4)", () => {
  const NOW = new Date("2026-08-14T09:00:00.000Z");

  function handlerWith(renewal: RecordingRenewal, publisher = new RecordingPublisher()) {
    return new IssuePasswordLinkHandler(
      reader("auth0|abc"),
      identity("https://auth/ticket-neuf"),
      { now: () => NOW },
      publisher,
      journalNames(),
      renewal,
    );
  }

  it("renouvelle la société désignée, à l'instant de l'horloge", async () => {
    const renewal = new RecordingRenewal();

    await handlerWith(renewal).execute(new IssuePasswordLinkCommand("usr_1", "cmp_b"));

    expect(renewal.renewed).toEqual([{ userId: "usr_1", companyId: "cmp_b", at: NOW }]);
  });

  it("sans société désignée, laisse l'adaptateur prendre celle que la file affiche", async () => {
    const renewal = new RecordingRenewal();

    await handlerWith(renewal).execute(new IssuePasswordLinkCommand("usr_1"));

    expect(renewal.renewed).toEqual([{ userId: "usr_1", companyId: null, at: NOW }]);
  });

  it("refuse — et ne rend pas le lien — quand il n'y a aucune invitation à renouveler", async () => {
    // Un lien sans invitation vivante mènerait la personne à un refus d'entrée.
    const publisher = new RecordingPublisher();
    const handler = handlerWith(new RecordingRenewal(null), publisher);

    await expect(handler.execute(new IssuePasswordLinkCommand("usr_1", "cmp_x"))).rejects.toThrow(
      PendingInvitationNotFoundError,
    );
    expect(publisher.traced).toEqual([]);
  });
});
