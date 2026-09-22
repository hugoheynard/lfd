import { AppConfig } from "../../config/app-config.js";
import {
  IdentityLinkRefusedError,
  IdentityProviderUnavailableError,
  IdentitySubjectUnknownError,
  IdentityUnlinkRefusedError,
} from "../../shared/errors/identity-errors.js";
import { Auth0IdentityGateway } from "../auth0-identity.gateway.js";
import { Auth0ManagementClient, BAD_REQUEST, NOT_FOUND } from "../auth0-management.client.js";

const PRIMARY = "auth0|abcdef";

/** Un appel tel que la passerelle le passe au transport — de quoi l'assertir. */
interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly body: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Le transport doublé : une **sous-classe**, jamais un objet greffé sur un
 * prototype ni un module remplacé. Le vrai constructeur tourne (il ne fait que
 * garder `AppConfig`), seul `call` — le seul endroit qui touche le réseau — est
 * remplacé par une réponse scriptée.
 */
class FakeManagementClient extends Auth0ManagementClient {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly reply: unknown) {
    super(new AppConfig());
  }

  override async call(
    method: string,
    path: string,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    this.calls.push({ method, path, body });
    return await Promise.resolve(this.reply);
  }
}

function gatewayReplying(reply: unknown): {
  readonly gateway: Auth0IdentityGateway;
  readonly api: FakeManagementClient;
} {
  const api = new FakeManagementClient(reply);
  return { gateway: new Auth0IdentityGateway(api), api };
}

/** La forme qu'Auth0 rend sur `GET /api/v2/users/{id}`. */
const USER_WITH_TWO_IDENTITIES = {
  user_id: PRIMARY,
  identities: [
    { provider: "auth0", user_id: "abcdef", connection: "lfc-b2b-customers", isSocial: false },
    { provider: "google-oauth2", user_id: "1078", connection: "google-oauth2", isSocial: true },
  ],
};

describe("Auth0IdentityGateway — les méthodes de connexion", () => {
  describe("listIdentities", () => {
    it("rend chaque identité, et désigne la principale par le sujet du compte", async () => {
      const { gateway, api } = gatewayReplying(USER_WITH_TWO_IDENTITIES);

      await expect(gateway.listIdentities(PRIMARY)).resolves.toEqual([
        {
          provider: "auth0",
          userId: "abcdef",
          connection: "lfc-b2b-customers",
          isPrimary: true,
        },
        {
          provider: "google-oauth2",
          userId: "1078",
          connection: "google-oauth2",
          isPrimary: false,
        },
      ]);
      expect(api.calls).toEqual([
        { method: "GET", path: `/api/v2/users/${encodeURIComponent(PRIMARY)}`, body: undefined },
      ]);
    });

    /**
     * Certaines connexions sociales rendent le `user_id` en JSON **numérique**.
     * Le refuser ferait disparaître l'identité de la liste, donc la rendrait
     * impossible à détacher.
     */
    it("lit un identifiant rendu en nombre", async () => {
      const { gateway } = gatewayReplying({
        user_id: "facebook|42",
        identities: [{ provider: "facebook", user_id: 42, connection: "facebook" }],
      });

      await expect(gateway.listIdentities("facebook|42")).resolves.toEqual([
        { provider: "facebook", userId: "42", connection: "facebook", isPrimary: true },
      ]);
    });

    it("écarte une entrée dont la forme surprend plutôt que de l'inventer", async () => {
      const { gateway } = gatewayReplying({
        user_id: PRIMARY,
        identities: [{ provider: "auth0" }, "pas un objet", { user_id: "abcdef" }],
      });

      await expect(gateway.listIdentities(PRIMARY)).resolves.toEqual([]);
    });

    it("rend une liste vide si le fournisseur ne rend aucun tableau", async () => {
      const { gateway } = gatewayReplying({ user_id: PRIMARY });

      await expect(gateway.listIdentities(PRIMARY)).resolves.toEqual([]);
    });

    it("refuse un sujet que le fournisseur ne connaît pas", async () => {
      const { gateway } = gatewayReplying(NOT_FOUND);

      await expect(gateway.listIdentities(PRIMARY)).rejects.toBeInstanceOf(
        IdentitySubjectUnknownError,
      );
    });

    /** Un sujet `dev|…` est le NÔTRE : l'envoyer chez Auth0 rend un 400 illisible. */
    it("refuse un sujet qui ne peut pas appartenir au fournisseur, sans appeler", async () => {
      const { gateway, api } = gatewayReplying(USER_WITH_TWO_IDENTITIES);

      await expect(gateway.listIdentities("dev|quelquun@exemple.fr")).rejects.toBeInstanceOf(
        IdentitySubjectUnknownError,
      );
      expect(api.calls).toEqual([]);
    });
  });

  describe("linkIdentity", () => {
    it("absorbe l'identité secondaire et rend la liste qui en résulte", async () => {
      const { gateway, api } = gatewayReplying(USER_WITH_TWO_IDENTITIES.identities);

      await expect(gateway.linkIdentity(PRIMARY, "le-jeton")).resolves.toEqual([
        { provider: "auth0", userId: "abcdef", connection: "lfc-b2b-customers", isPrimary: true },
        {
          provider: "google-oauth2",
          userId: "1078",
          connection: "google-oauth2",
          isPrimary: false,
        },
      ]);
      expect(api.calls).toEqual([
        {
          method: "POST",
          path: `/api/v2/users/${encodeURIComponent(PRIMARY)}/identities`,
          body: { link_with: "le-jeton" },
        },
      ]);
    });

    /**
     * Le refus qui a fait écrire la sentinelle `BAD_REQUEST` : sans elle, un
     * `link_with` refusé sortait en `500` anonyme, pour quelqu'un à qui il n'y
     * avait rien à réparer.
     */
    it("nomme le refus du fournisseur au lieu d'en faire un incident", async () => {
      const { gateway } = gatewayReplying(BAD_REQUEST);

      await expect(gateway.linkIdentity(PRIMARY, "le-jeton")).rejects.toBeInstanceOf(
        IdentityLinkRefusedError,
      );
    });

    it("refuse un compte principal inconnu du fournisseur", async () => {
      const { gateway } = gatewayReplying(NOT_FOUND);

      await expect(gateway.linkIdentity(PRIMARY, "le-jeton")).rejects.toBeInstanceOf(
        IdentitySubjectUnknownError,
      );
    });
  });

  describe("unlinkIdentity", () => {
    it("détache par la stratégie et l'identifiant secondaire", async () => {
      const { gateway, api } = gatewayReplying([USER_WITH_TWO_IDENTITIES.identities[0]]);

      await expect(gateway.unlinkIdentity(PRIMARY, "google-oauth2", "1078")).resolves.toEqual([
        { provider: "auth0", userId: "abcdef", connection: "lfc-b2b-customers", isPrimary: true },
      ]);
      expect(api.calls).toEqual([
        {
          method: "DELETE",
          path: `/api/v2/users/${encodeURIComponent(PRIMARY)}/identities/google-oauth2/1078`,
          body: undefined,
        },
      ]);
    });

    it("refuse ce qui n'est pas une identité secondaire de ce compte", async () => {
      const { gateway } = gatewayReplying(BAD_REQUEST);

      await expect(gateway.unlinkIdentity(PRIMARY, "google-oauth2", "1078")).rejects.toBeInstanceOf(
        IdentityUnlinkRefusedError,
      );
    });

    it("refuse un compte principal inconnu du fournisseur", async () => {
      const { gateway } = gatewayReplying(NOT_FOUND);

      await expect(gateway.unlinkIdentity(PRIMARY, "google-oauth2", "1078")).rejects.toBeInstanceOf(
        IdentitySubjectUnknownError,
      );
    });
  });
});

/**
 * Régression : depuis que `Auth0ManagementClient` rend une **valeur** sur un
 * `400` (la sentinelle `BAD_REQUEST`), un refus non traité se lirait comme un
 * succès. Les gestes qui n'en attendent pas doivent donc continuer d'échouer —
 * sans quoi une adresse refusée par le tenant passerait pour propagée, et la
 * personne se connecterait avec l'ancienne en en voyant une autre à l'écran.
 */
describe("Auth0IdentityGateway — un refus du fournisseur ne passe jamais pour un succès", () => {
  it("la propagation d'adresse échoue sur un refus", async () => {
    const { gateway } = gatewayReplying(BAD_REQUEST);

    await expect(gateway.changeEmail(PRIMARY, "neuve@exemple.fr")).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
  });

  it("l'ouverture d'identité échoue sur un refus", async () => {
    const { gateway } = gatewayReplying(BAD_REQUEST);

    await expect(
      gateway.provision("lfc-b2b-customers", {
        email: "neuve@exemple.fr",
        firstName: "Camille",
        lastName: "Martin",
      }),
    ).rejects.toBeInstanceOf(IdentityProviderUnavailableError);
  });

  it("l'émission d'un lien de mot de passe échoue sur un refus", async () => {
    const { gateway } = gatewayReplying(BAD_REQUEST);

    await expect(gateway.issuePasswordLink(PRIMARY)).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
  });
});
