import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  IdentityProofExpiredError,
  IdentityUnlinkRefusedError,
} from "../../../../../platform/shared/errors/identity-errors.js";
import {
  LoginMethodAlreadyLinkedError,
  LoginMethodClaimedElsewhereError,
} from "../../../domain/errors/account-errors.js";
import {
  CustomerIdentityPort,
  type LoginMethod,
} from "../../../domain/ports/customer-identity.port.js";
import {
  IdentityProofVerifier,
  type IdentityProof,
} from "../../../domain/ports/identity-proof.verifier.js";
import { LoginSubjectReader } from "../../../domain/ports/login-subject.reader.js";
import { ListMyLoginMethodsHandler } from "../../queries/list-my-login-methods.handler.js";
import { ListMyLoginMethodsQuery } from "../../queries/list-my-login-methods.query.js";
import { LinkLoginMethodCommand } from "../link-login-method.command.js";
import { LinkLoginMethodHandler } from "../link-login-method.handler.js";
import { RevokeLoginMethodCommand } from "../revoke-login-method.command.js";
import { RevokeLoginMethodHandler } from "../revoke-login-method.handler.js";
import { journalNames } from "./member-acts-doubles.js";

/**
 * **Rattacher, lister, retirer une méthode de connexion** (plan
 * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, lot B).
 *
 * Ce qui est éprouvé ici est l'ORCHESTRATION, et elle a un seul endroit
 * dangereux : la fenêtre entre la lecture qui refuse (chez nous) et
 * l'écriture qui rattache (chez un tiers). Le reste — signature, audience,
 * fraîcheur du jeton — appartient au vérificateur, qui a sa propre suite.
 */
const PRIMARY = "auth0|camille";
const GOOGLE = "google-oauth2|10203040";
const OWNER = "u1";

/** Le port de preuve : il rend le sujet qu'on lui dit de rendre, ou refuse. */
class Proof extends IdentityProofVerifier {
  constructor(private readonly outcome: string | Error) {
    super();
  }
  verify(): Promise<IdentityProof> {
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve({ subject: this.outcome });
  }
}

/**
 * Qui possède un sujet chez nous. `appearing` est la course : la ligne
 * n'existe pas à la première lecture, elle existe à la seconde — exactement ce
 * que fait le provisionnement automatique pendant qu'on rattache.
 */
class Subjects extends LoginSubjectReader {
  reads = 0;
  constructor(
    private readonly owners: Readonly<Record<string, string>> = {},
    private readonly appearing: { readonly subject: string; readonly userId: string } | null = null,
  ) {
    super();
  }
  findUserIdBySubject(subject: string): Promise<string | null> {
    this.reads += 1;
    if (this.appearing !== null && this.appearing.subject === subject) {
      return Promise.resolve(this.reads === 1 ? null : this.appearing.userId);
    }
    return Promise.resolve(this.owners[subject] ?? null);
  }
}

const primaryMethod: LoginMethod = {
  provider: "auth0",
  secondaryUserId: "camille",
  connection: "lfc-customers",
  isPrimary: true,
};
const googleMethod: LoginMethod = {
  provider: "google-oauth2",
  secondaryUserId: "10203040",
  connection: null,
  isPrimary: false,
};

/** Le fournisseur : il tient une liste, et note ce qu'on lui a demandé de défaire. */
class Identity extends CustomerIdentityPort {
  readonly unlinked: string[] = [];
  linkCalls = 0;
  constructor(private methods: readonly LoginMethod[] = [primaryMethod]) {
    super();
  }
  changeEmail(): Promise<void> {
    return Promise.resolve();
  }
  provision(): never {
    throw new Error("hors sujet");
  }
  issuePasswordLink(): never {
    throw new Error("hors sujet");
  }
  listLoginMethods(): Promise<readonly LoginMethod[]> {
    return Promise.resolve(this.methods);
  }
  linkLoginMethod(): Promise<readonly LoginMethod[]> {
    this.linkCalls += 1;
    this.methods = [...this.methods, googleMethod];
    return Promise.resolve(this.methods);
  }
  unlinkLoginMethod(
    _subject: string,
    provider: string,
    secondaryUserId: string,
  ): Promise<readonly LoginMethod[]> {
    this.unlinked.push(`${provider}|${secondaryUserId}`);
    this.methods = this.methods.filter(
      (method) => method.provider !== provider || method.secondaryUserId !== secondaryUserId,
    );
    return Promise.resolve(this.methods);
  }
}

function linkHandler(
  identity: Identity,
  subjects: Subjects,
  proof: Proof,
  events = new RecordingPublisher(),
): { handler: LinkLoginMethodHandler; events: RecordingPublisher } {
  return {
    handler: new LinkLoginMethodHandler(proof, subjects, identity, events, journalNames()),
    events,
  };
}

const linkCommand = new LinkLoginMethodCommand(OWNER, PRIMARY, "le-jeton-de-preuve");

describe("rattacher une méthode de connexion", () => {
  it("vérifie la preuve, rattache, et inscrit le fait sans le sujet secondaire", async () => {
    const identity = new Identity();
    const { handler, events } = linkHandler(identity, new Subjects(), new Proof(GOOGLE));

    await handler.execute(linkCommand);

    expect(identity.linkCalls).toBe(1);
    expect(events.factTypes()).toEqual(["user.identity_linked"]);
    const fact = events.traced[0]?.journalFact();
    expect(fact?.payload).toEqual({
      subjectLabel: "Camille Rousseau",
      provider: "google-oauth2",
      connection: null,
      linkedVia: "profile",
    });
    // Ce qui ne doit JAMAIS y être : l'identifiant chez le fournisseur.
    expect(JSON.stringify(fact?.payload)).not.toContain("10203040");
  });

  it("refuse AVANT de rattacher quand le compte tiers ouvre déjà un autre compte", async () => {
    const identity = new Identity();
    const subjects = new Subjects({ [GOOGLE]: "u9" });
    const { handler, events } = linkHandler(identity, subjects, new Proof(GOOGLE));

    await expect(handler.execute(linkCommand)).rejects.toBeInstanceOf(
      LoginMethodClaimedElsewhereError,
    );
    expect(identity.linkCalls).toBe(0);
    expect(events.traced).toEqual([]);
  });

  /**
   * 🔴 La détection avec compensation (§9.4). Sans elle, le compte apparu
   * pendant le rattachement deviendrait inatteignable : son sujet ne
   * produirait plus jamais de jeton, et personne ne le saurait.
   */
  it("défait le rattachement quand une ligne apparaît pendant le geste", async () => {
    const identity = new Identity();
    const subjects = new Subjects({}, { subject: GOOGLE, userId: "u9" });
    const { handler, events } = linkHandler(identity, subjects, new Proof(GOOGLE));

    await expect(handler.execute(linkCommand)).rejects.toBeInstanceOf(
      LoginMethodClaimedElsewhereError,
    );
    expect(identity.linkCalls).toBe(1);
    expect(identity.unlinked).toEqual([GOOGLE]);
    expect(events.traced).toEqual([]);
  });

  it("refuse une preuve qui désigne le compte courant — on ne se relie pas à soi-même", async () => {
    const identity = new Identity();
    const { handler } = linkHandler(identity, new Subjects(), new Proof(PRIMARY));

    await expect(handler.execute(linkCommand)).rejects.toBeInstanceOf(
      LoginMethodAlreadyLinkedError,
    );
    expect(identity.linkCalls).toBe(0);
  });

  it("laisse remonter une preuve périmée, et ne rattache rien", async () => {
    const identity = new Identity();
    const { handler } = linkHandler(
      identity,
      new Subjects(),
      new Proof(new IdentityProofExpiredError()),
    );

    await expect(handler.execute(linkCommand)).rejects.toBeInstanceOf(IdentityProofExpiredError);
    expect(identity.linkCalls).toBe(0);
  });
});

describe("lister et retirer les méthodes de connexion", () => {
  it("ne publie que ce qu'un écran affiche — jamais l'identifiant du fournisseur", async () => {
    const identity = new Identity([primaryMethod, googleMethod]);
    const handler = new ListMyLoginMethodsHandler(identity);

    const view = await handler.execute(new ListMyLoginMethodsQuery(PRIMARY));

    expect(view).toEqual([
      { provider: "auth0", connection: "lfc-customers", isPrimary: true },
      { provider: "google-oauth2", connection: null, isPrimary: false },
    ]);
  });

  it("retrouve l'identifiant secondaire lui-même, à partir du seul nom de connexion", async () => {
    const identity = new Identity([primaryMethod, googleMethod]);
    const events = new RecordingPublisher();
    const handler = new RevokeLoginMethodHandler(identity, events, journalNames());

    await handler.execute(new RevokeLoginMethodCommand(OWNER, PRIMARY, "google-oauth2"));

    expect(identity.unlinked).toEqual([GOOGLE]);
    expect(events.factTypes()).toEqual(["user.identity_revoked"]);
  });

  /**
   * La méthode principale porte le compte, et la Management API ne la délie
   * jamais : c'est pour ça qu'aucun refus « dernière méthode » n'existe (§9.6).
   * Le seul refus possible est celui d'une vue périmée.
   */
  it("refuse de retirer la méthode principale, et n'appelle pas le fournisseur", async () => {
    const identity = new Identity([primaryMethod]);
    const events = new RecordingPublisher();
    const handler = new RevokeLoginMethodHandler(identity, events, journalNames());

    await expect(
      handler.execute(new RevokeLoginMethodCommand(OWNER, PRIMARY, "auth0")),
    ).rejects.toBeInstanceOf(IdentityUnlinkRefusedError);
    expect(identity.unlinked).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
