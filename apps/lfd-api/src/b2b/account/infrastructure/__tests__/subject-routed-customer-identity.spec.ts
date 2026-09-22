import type { MailReceipt } from "@lfd/mailer";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { Auth0IdentityGateway } from "../../../../platform/identity/auth0-identity.gateway.js";
import { Auth0ManagementClient } from "../../../../platform/identity/auth0-management.client.js";
import type {
  IdentityToProvision,
  LoginMethod,
  ProvisionedIdentity,
} from "../../domain/ports/customer-identity.port.js";
import { Auth0CustomerIdentity } from "../auth0-customer-identity.js";
import { DevCustomerIdentity } from "../dev-customer-identity.js";
import { SubjectRoutedCustomerIdentity } from "../subject-routed-customer-identity.js";

const REAL = "auth0|vrai-sujet";
const FABRIQUE = "dev|hugo@exemple.fr";

/** Ce qu'un adaptateur a été prié de faire — assez pour dire QUI a répondu. */
const vus: { auth0: string[]; dev: string[] } = { auth0: [], dev: [] };

class Auth0Spy extends Auth0CustomerIdentity {
  constructor() {
    super(new Auth0IdentityGateway(new Auth0ManagementClient(new AppConfig())), new AppConfig(), {
      enabled: false,
      send: (): Promise<MailReceipt> => Promise.reject(new Error("aucun envoi attendu ici")),
    });
  }

  override listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    vus.auth0.push(subject);
    return Promise.resolve([]);
  }

  override issuePasswordLink(subject: string): Promise<string> {
    vus.auth0.push(subject);
    return Promise.resolve("lien-auth0");
  }

  override sendPasswordResetLink(subject: string): Promise<void> {
    vus.auth0.push(`envoi:${subject}`);
    return Promise.resolve();
  }

  override provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    vus.auth0.push(`provision:${input.email}`);
    return Promise.resolve({ subject: REAL, passwordSetupUrl: "lien-auth0" });
  }
}

class DevSpy extends DevCustomerIdentity {
  constructor() {
    // Le mailer n'est jamais appelé ici : ce fichier n'éprouve QUE l'aiguillage,
    // et chaque méthode observée est remplacée juste en dessous. Il REJETTE
    // plutôt que de résoudre — un envoi silencieux serait un faux vert.
    super(new AppConfig(), {
      enabled: false,
      send: (): Promise<MailReceipt> => Promise.reject(new Error("aucun envoi attendu ici")),
    });
  }

  override listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    vus.dev.push(subject);
    return Promise.resolve([]);
  }

  override issuePasswordLink(subject: string): Promise<string> {
    vus.dev.push(subject);
    return Promise.resolve("lien-dev");
  }

  override sendPasswordResetLink(subject: string): Promise<void> {
    vus.dev.push(`envoi:${subject}`);
    return Promise.resolve();
  }

  override provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    vus.dev.push(`provision:${input.email}`);
    return Promise.resolve({ subject: FABRIQUE, passwordSetupUrl: "lien-dev" });
  }
}

describe("SubjectRoutedCustomerIdentity", () => {
  let routeur: SubjectRoutedCustomerIdentity;

  beforeEach(() => {
    vus.auth0 = [];
    vus.dev = [];
    routeur = new SubjectRoutedCustomerIdentity(new Auth0Spy(), new DevSpy());
  });

  /**
   * Régression : le choix de l'adaptateur se faisait par CONFIGURATION — « le
   * M2M est-il renseigné ? » — alors que l'incompatibilité est par COMPTE.
   * Renseigner le M2M dans son `.env` rendait définitivement inutilisables les
   * comptes déjà ouverts en `dev|…` : la garde `isProviderSubject` les refusait
   * avant tout appel, et rien ne disait pourquoi (Hugo, 2026-09-22).
   */
  it("sert un compte fabriqué en développement par l'adaptateur qui l'a ouvert", async () => {
    await routeur.listLoginMethods(FABRIQUE);

    expect(vus.dev).toEqual([FABRIQUE]);
    expect(vus.auth0).toEqual([]);
  });

  it("sert un vrai sujet par le vrai fournisseur", async () => {
    await routeur.listLoginMethods(REAL);

    expect(vus.auth0).toEqual([REAL]);
    expect(vus.dev).toEqual([]);
  });

  /** La même aiguille vaut pour tout geste qui PORTE un sujet. */
  it("route aussi le lien de mot de passe", async () => {
    await expect(routeur.issuePasswordLink(FABRIQUE)).resolves.toBe("lien-dev");
    await expect(routeur.issuePasswordLink(REAL)).resolves.toBe("lien-auth0");
  });

  /**
   * L'envoi du lien de mot de passe porte un sujet : il se route comme le
   * reste. Sans cette ligne, un compte ouvert en `dev|…` partirait chez Auth0,
   * qui ne le connaît pas — la panne que ce routeur existe pour supprimer.
   */
  it("route aussi l'envoi du lien de mot de passe", async () => {
    await routeur.sendPasswordResetLink(FABRIQUE, "hugo@exemple.fr");
    await routeur.sendPasswordResetLink(REAL, "hugo@exemple.fr");

    expect(vus.dev).toEqual([`envoi:${FABRIQUE}`]);
    expect(vus.auth0).toEqual([`envoi:${REAL}`]);
  });

  /**
   * Ouvrir n'a pas de sujet à router : l'identité n'existe pas encore. Le vrai
   * fournisseur répond, ce qui est exactement le comportement d'avant ce
   * routeur dès lors que le M2M est configuré.
   */
  it("ouvre toujours chez le vrai fournisseur", async () => {
    await routeur.provision({
      email: "nouveau@exemple.fr",
      firstName: "Hugo",
      lastName: "Heynard",
    });

    expect(vus.auth0).toEqual(["provision:nouveau@exemple.fr"]);
    expect(vus.dev).toEqual([]);
  });
});
