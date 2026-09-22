import type { MailReceipt } from "@lfd/mailer";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { Auth0IdentityGateway } from "../../../../platform/identity/auth0-identity.gateway.js";
import { Auth0ManagementClient } from "../../../../platform/identity/auth0-management.client.js";
import type { LinkedIdentity } from "../../../../platform/identity/auth0-user-shape.js";
import {
  IdentityProviderUnavailableError,
  IdentitySubjectUnknownError,
} from "../../../../platform/shared/errors/identity-errors.js";
import type { B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { LoginMethodsUnknownAccountError } from "../../domain/errors/account-errors.js";
import { Auth0CustomerIdentity } from "../auth0-customer-identity.js";

const SUBJECT = "auth0|inconnu-du-tenant";

/**
 * La passerelle doublée : une **sous-classe**, comme le fait déjà la suite de
 * `platform/identity`. Le vrai constructeur tourne ; seules les trois lectures
 * qui touchent le réseau sont remplacées, et elles ne font qu'échouer — c'est
 * le seul comportement que ce fichier éprouve.
 */
class FailingGateway extends Auth0IdentityGateway {
  constructor(private readonly fail: () => never) {
    super(new Auth0ManagementClient(new AppConfig()));
  }

  override listIdentities(): Promise<readonly LinkedIdentity[]> {
    this.fail();
  }

  override linkIdentity(): Promise<readonly LinkedIdentity[]> {
    this.fail();
  }

  override unlinkIdentity(): Promise<readonly LinkedIdentity[]> {
    this.fail();
  }
}

/** Un mailer qui n'a rien à faire ici : aucun de ces chemins n'envoie. */
const silentMailer: B2bMailer = {
  enabled: false,
  send: (): Promise<MailReceipt> =>
    Promise.reject(new Error("aucun envoi attendu sur ces trois lectures")),
};

function adapter(fail: () => never): Auth0CustomerIdentity {
  return new Auth0CustomerIdentity(new FailingGateway(fail), new AppConfig(), silentMailer);
}

describe("Auth0CustomerIdentity — un sujet que le fournisseur ne connaît plus", () => {
  /**
   * Régression : `GET /me/identities` sortait en **500** sur un compte dont le
   * sujet n'existe pas au tenant — `IdentitySubjectUnknownError` est un
   * `TechnicalError`, levé exprès pour un geste STAFF qui peut réparer en
   * repartant de l'adresse. Sur l'écran de la personne, il n'y a personne pour
   * réparer : elle lisait seulement ses méthodes de connexion, et recevait
   * « une panne est survenue » pendant que le journal de production
   * enregistrait une alarme (relevé en développement le 2026-09-22).
   */
  it.each(["list", "link", "unlink"] as const)(
    "rend un refus nommé plutôt qu'une panne — %s",
    async (geste) => {
      const port = adapter(() => {
        throw new IdentitySubjectUnknownError(SUBJECT);
      });

      const call =
        geste === "list"
          ? port.listLoginMethods(SUBJECT)
          : geste === "link"
            ? port.linkLoginMethod(SUBJECT, "jeton")
            : port.unlinkLoginMethod(SUBJECT, "google-oauth2", "xyz");

      await expect(call).rejects.toBeInstanceOf(LoginMethodsUnknownAccountError);
    },
  );

  /**
   * Une vraie panne du canal reste une panne : la traduction ne vaut que pour
   * « ce sujet m'est inconnu », jamais pour « je ne réponds pas ». Sans cette
   * limite, une indisponibilité d'Auth0 se lirait « votre compte n'est plus
   * reconnu » — un message faux, et inquiétant.
   */
  it("laisse passer une panne du fournisseur", async () => {
    const port = adapter(() => {
      throw new IdentityProviderUnavailableError("canal en échec");
    });

    await expect(port.listLoginMethods(SUBJECT)).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
  });
});
