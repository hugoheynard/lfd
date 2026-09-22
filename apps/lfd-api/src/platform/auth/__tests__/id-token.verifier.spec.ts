import { SignJWT, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";

import { AppConfig } from "../../config/app-config.js";
import {
  IdentityProofExpiredError,
  IdentityProofInvalidError,
  IdentityProofUnverifiableError,
} from "../../shared/errors/identity-errors.js";
import { FixedClock } from "../../time/fixed-clock.js";
import { AuthConfig } from "../auth.config.js";
import { IDENTITY_PROOF_MAX_AGE_SECONDS, IdTokenVerifier } from "../id-token.verifier.js";

const TENANT = "tenant-de-test.eu.auth0.com";
const ISSUER = `https://${TENANT}/`;
const CLIENT_ID = "spa-boutique";

/**
 * Le type de clé que `jose` rend, pris **sur la fonction** : `CryptoKey` est une
 * globale que le tsconfig des specs ne déclare pas, et l'écrire à la main ferait
 * diverger le double de la bibliothèque qu'il double.
 */
type LocalKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

/**
 * L'instant de référence de la suite. Il ne sort jamais d'ici : **toutes** les
 * dates des jetons s'en déduisent, et l'horloge du vérificateur est la même.
 * Les dates ne sont donc comparées qu'entre elles — le calendrier réel ne peut
 * pas faire basculer un cas (CLAUDE.md §5, la seule exception admise).
 */
const NOW = new Date("2026-01-02T10:00:00.000Z");

/**
 * Un `AppConfig` doublé, comme `s3-document-store.spec` : une **sous-classe**,
 * jamais un objet greffé sur le prototype. Le vrai constructeur tourne
 * (`test/setup-env.ts` fournit ce qu'il exige), seules les deux lectures qui
 * décident ici sont remplacées.
 */
class FakeConfig extends AppConfig {
  constructor(private readonly clientId: string | null) {
    super();
  }

  override auth0Domain(): string {
    return TENANT;
  }

  override auth0CustomerClientId(): string | null {
    return this.clientId;
  }
}

/**
 * Le vérificateur, branché sur une paire de clés **locale**.
 *
 * Signer avec les vraies clés du tenant est impossible, et vérifier un jeton
 * non signé ne prouverait rien de ce que fait la production : on substitue le
 * seul point d'extension prévu pour ça (`keys()`), et tout le reste — `iss`,
 * `aud`, `azp`, `exp`, `iat` — est exercé par le vrai code.
 */
class LocalKeysVerifier extends IdTokenVerifier {
  constructor(
    config: AuthConfig,
    clock: FixedClock,
    private readonly publicKey: LocalKeyPair["publicKey"],
  ) {
    super(config, clock);
  }

  protected override keys(): JWTVerifyGetKey {
    return async () => await Promise.resolve(this.publicKey);
  }
}

describe("IdTokenVerifier", () => {
  let publicKey: LocalKeyPair["publicKey"];
  let privateKey: LocalKeyPair["privateKey"];

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
    // La clé publique doit rester exportable : sans elle, aucune vérification.
    expect(await exportJWK(publicKey)).toHaveProperty("kty", "RSA");
  });

  /** Un id_token tel que le tenant l'émet, avec les écarts qu'on veut éprouver. */
  async function issue(
    claims: Readonly<Record<string, string | number>> = {},
    options: { readonly issuedSecondsAgo?: number; readonly expired?: boolean } = {},
  ): Promise<string> {
    const nowSeconds = Math.floor(NOW.getTime() / 1000);
    const issuedAt = nowSeconds - (options.issuedSecondsAgo ?? 0);
    return await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("google-oauth2|123")
      .setIssuedAt(issuedAt)
      .setExpirationTime(options.expired === true ? nowSeconds - 1 : nowSeconds + 3600)
      .sign(privateKey);
  }

  function verifier(clientId: string | null = CLIENT_ID): IdTokenVerifier {
    return new LocalKeysVerifier(
      new AuthConfig(new FakeConfig(clientId)),
      new FixedClock(NOW),
      publicKey,
    );
  }

  it("rend le `sub` que le jeton prouve", async () => {
    await expect(verifier().verify(await issue())).resolves.toEqual({
      subject: "google-oauth2|123",
    });
  });

  it("accepte un jeton qui porte un `azp` égal au client", async () => {
    await expect(verifier().verify(await issue({ azp: CLIENT_ID }))).resolves.toEqual({
      subject: "google-oauth2|123",
    });
  });

  it("refuse un `azp` étranger", async () => {
    await expect(verifier().verify(await issue({ azp: "une-autre-app" }))).rejects.toBeInstanceOf(
      IdentityProofInvalidError,
    );
  });

  /**
   * Le cas NORMAL d'OIDC : `azp` n'est émis que si `aud` porte plusieurs
   * valeurs. L'exiger refuserait tous les rattachements — c'est le bloquant
   * B-2 du plan, et ce test est ce qui empêche qu'il revienne.
   */
  it("accepte un jeton SANS `azp` — il n'est pas émis quand l'audience est unique", async () => {
    await expect(verifier().verify(await issue())).resolves.toHaveProperty(
      "subject",
      "google-oauth2|123",
    );
  });

  it("refuse une audience qui n'est pas la SPA boutique", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience("https://api.test.local")
      .setSubject("google-oauth2|123")
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
      .sign(privateKey);
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(IdentityProofInvalidError);
  });

  it("refuse un émetteur qui n'est pas notre tenant", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://un-autre-tenant.eu.auth0.com/")
      .setAudience(CLIENT_ID)
      .setSubject("google-oauth2|123")
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
      .sign(privateKey);
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(IdentityProofInvalidError);
  });

  it("refuse une signature étrangère", async () => {
    const intrus = await generateKeyPair("RS256", { extractable: true });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("google-oauth2|123")
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
      .sign(intrus.privateKey);
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(IdentityProofInvalidError);
  });

  it("refuse un jeton expiré", async () => {
    await expect(verifier().verify(await issue({}, { expired: true }))).rejects.toBeInstanceOf(
      IdentityProofInvalidError,
    );
  });

  it("accepte une preuve de moins de cinq minutes", async () => {
    const token = await issue({}, { issuedSecondsAgo: IDENTITY_PROOF_MAX_AGE_SECONDS - 1 });
    await expect(verifier().verify(token)).resolves.toHaveProperty("subject");
  });

  it("refuse une preuve de plus de cinq minutes, et le dit autrement", async () => {
    const token = await issue({}, { issuedSecondsAgo: IDENTITY_PROOF_MAX_AGE_SECONDS + 1 });
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(IdentityProofExpiredError);
  });

  /** Une horloge d'émetteur qui avance ouvrirait la fenêtre d'autant. */
  it("refuse une preuve datée du futur", async () => {
    await expect(
      verifier().verify(await issue({}, { issuedSecondsAgo: -60 })),
    ).rejects.toBeInstanceOf(IdentityProofInvalidError);
  });

  it("refuse un jeton sans `iat`", async () => {
    const nowSeconds = Math.floor(NOW.getTime() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("google-oauth2|123")
      .setExpirationTime(nowSeconds + 3600)
      .sign(privateKey);
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(IdentityProofInvalidError);
  });

  /**
   * Fail-closed : sans `AUTH0_CUSTOMER_CLIENT_ID`, `aud` ne se comparerait à
   * rien — donc n'importe quel jeton du tenant, y compris celui d'une autre
   * application, prouverait une identité.
   */
  it("refuse tout quand l'application cliente n'est pas configurée", async () => {
    await expect(verifier(null).verify(await issue())).rejects.toBeInstanceOf(
      IdentityProofUnverifiableError,
    );
  });
});
