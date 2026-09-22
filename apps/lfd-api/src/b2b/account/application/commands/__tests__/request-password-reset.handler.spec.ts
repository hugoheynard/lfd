import { AppConfig } from "../../../../../platform/config/app-config.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { NoPasswordLoginMethodError } from "../../../domain/errors/account-errors.js";
import {
  CustomerIdentityPort,
  type LoginMethod,
} from "../../../domain/ports/customer-identity.port.js";
import { RequestPasswordResetCommand } from "../request-password-reset.command.js";
import { RequestPasswordResetHandler } from "../request-password-reset.handler.js";
import { journalNames } from "./member-acts-doubles.js";

/**
 * **« Changer mon mot de passe », depuis son profil** (plan
 * `documentation/auth-inscription/plan-page-mon-profil.md`, §3).
 *
 * Trois choses s'éprouvent ici, et elles sont toutes d'orchestration :
 * le refus posé AVANT le premier appel sortant, l'ordre journal → envoi, et le
 * fait que rien dans ce chemin ne voie jamais le lien. Ce que le ticket fait
 * chez le fournisseur appartient à la passerelle, qui a sa propre suite.
 */
const SUBJECT = "auth0|camille";
const USER_ID = "u1";
const EMAIL = "camille@pqmarais.fr";
const PASSWORD_CONNECTION = "Username-Password-Authentication";

const passwordMethod: LoginMethod = {
  provider: "auth0",
  secondaryUserId: "camille",
  connection: PASSWORD_CONNECTION,
  isPrimary: true,
};

const googleMethod: LoginMethod = {
  provider: "google-oauth2",
  secondaryUserId: "10203040",
  connection: null,
  isPrimary: true,
};

/** La connexion base de données, posée : le `.env` du poste ne décide de rien. */
class Config extends AppConfig {
  override auth0DatabaseConnection(): string {
    return PASSWORD_CONNECTION;
  }
}

/**
 * Le fournisseur : il tient une liste de méthodes, note les envois, et peut
 * tomber en panne à l'envoi.
 */
class Identity extends CustomerIdentityPort {
  readonly sent: { subject: string; email: string }[] = [];

  constructor(
    private readonly methods: readonly LoginMethod[] = [passwordMethod],
    private readonly failing = false,
  ) {
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
    return Promise.resolve(this.methods);
  }
  unlinkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.resolve(this.methods);
  }
  sendPasswordResetLink(subject: string, email: string): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error("canal indisponible"));
    }
    this.sent.push({ subject, email });
    return Promise.resolve();
  }
}

function handler(identity: Identity): {
  readonly run: () => Promise<void>;
  readonly events: RecordingPublisher;
} {
  const events = new RecordingPublisher();
  const under = new RequestPasswordResetHandler(identity, new Config(), events, journalNames());
  return {
    run: () => under.execute(new RequestPasswordResetCommand(USER_ID, SUBJECT, EMAIL)),
    events,
  };
}

describe("RequestPasswordResetHandler", () => {
  it("envoie le lien à l'adresse du compte et inscrit la demande", async () => {
    const identity = new Identity();
    const { run, events } = handler(identity);

    await run();

    expect(identity.sent).toEqual([{ subject: SUBJECT, email: EMAIL }]);
    expect(events.factTypes()).toEqual(["user.password_reset_requested"]);
  });

  /**
   * Le fait nomme la personne au moment du geste, jamais son adresse ni son
   * sujet de connexion : le journal se relit largement et se garde longtemps.
   */
  it("n'écrit au journal ni l'adresse, ni le sujet, ni le lien", async () => {
    const { run, events } = handler(new Identity());

    await run();

    const fact = events.traced[0]?.journalFact();
    expect(fact?.payload).toEqual({ subjectLabel: "Camille Rousseau" });
    expect(JSON.stringify(fact)).not.toContain(EMAIL);
    expect(JSON.stringify(fact)).not.toContain("auth0|");
  });

  /**
   * Un compte entré par Google n'a pas d'identité à mot de passe.
   * `issuePasswordLink` ne filtre pas la connexion — il ne vérifie que la forme
   * du sujet —, donc sans ce refus Auth0 refusait d'émettre et la chaîne
   * rendait un 500 « panne du fournisseur » à quelqu'un dont le compte va bien.
   */
  it("refuse un compte sans connexion par mot de passe, sans rien envoyer", async () => {
    const identity = new Identity([googleMethod]);
    const { run, events } = handler(identity);

    await expect(run()).rejects.toBeInstanceOf(NoPasswordLoginMethodError);
    expect(identity.sent).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  /**
   * Un `provider` `auth0` ne suffit pas : c'est aussi ce que porte une identité
   * d'un autre tenant. Seule la **connexion** dit qu'il y a un mot de passe.
   */
  it("refuse une identité `auth0` d'une autre connexion", async () => {
    const identity = new Identity([{ ...passwordMethod, connection: "autre-connexion" }]);
    const { run } = handler(identity);

    await expect(run()).rejects.toBeInstanceOf(NoPasswordLoginMethodError);
    expect(identity.sent).toEqual([]);
  });

  /**
   * L'ordre, et c'est la règle d'`OpenStaffAccess` : jamais un e-mail envoyé
   * derrière un 500. Le fait part d'abord ; un envoi qui échoue échoue la
   * requête, et la personne réessaie sans qu'un lien traîne déjà dans sa boîte.
   */
  it("inscrit la demande AVANT d'envoyer, et remonte l'échec de l'envoi", async () => {
    const { run, events } = handler(new Identity([passwordMethod], true));

    await expect(run()).rejects.toThrow("canal indisponible");
    expect(events.factTypes()).toEqual(["user.password_reset_requested"]);
  });
});
