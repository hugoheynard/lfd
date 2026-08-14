import { CustomerIdentityPort } from "../../../domain/ports/customer-identity.port.js";
import { PendingAccessNotFoundError } from "../../../domain/errors/account-errors.js";
import { PendingAccessReader } from "../../../domain/ports/pending-access.reader.js";
import { IssuePasswordLinkCommand } from "../issue-password-link.command.js";
import { IssuePasswordLinkHandler } from "../issue-password-link.handler.js";

function reader(subject: string | null): PendingAccessReader {
  return {
    list: () => Promise.resolve([]),
    subjectOf: () => Promise.resolve(subject),
  } as PendingAccessReader;
}

function identity(url: string, issued: string[] = []): CustomerIdentityPort {
  return {
    provision: () => Promise.reject(new Error("non appelé")),
    issuePasswordLink: (subject: string) => {
      issued.push(subject);
      return Promise.resolve(url);
    },
  } as unknown as CustomerIdentityPort;
}

describe("fabriquer un lien à remettre à la main", () => {
  it("en fabrique un NEUF pour la personne qui attend", async () => {
    // On n'en retrouve pas un : un lien est à usage unique et daté. Ressortir
    // celui de l'ouverture rendrait un lien mort trois semaines plus tard.
    const issued: string[] = [];
    const handler = new IssuePasswordLinkHandler(
      reader("auth0|abc"),
      identity("https://auth/ticket-neuf", issued),
    );

    const url = await handler.execute(new IssuePasswordLinkCommand("usr_1"));

    expect(url).toBe("https://auth/ticket-neuf");
    expect(issued).toEqual(["auth0|abc"]);
  });

  it("REFUSE pour quelqu'un qui n'attend plus", async () => {
    // Le cas fréquent : la personne a posé son mot de passe entre l'affichage
    // de la file et le clic. Lui fabriquer un lien reviendrait à offrir de quoi
    // le réinitialiser sans qu'elle ait rien demandé.
    const issued: string[] = [];
    const handler = new IssuePasswordLinkHandler(reader(null), identity("https://auth/x", issued));

    await expect(handler.execute(new IssuePasswordLinkCommand("usr_1"))).rejects.toThrow(
      PendingAccessNotFoundError,
    );
    expect(issued).toEqual([]);
  });
});
