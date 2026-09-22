import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

import {
  IdentityProofExpiredError,
  IdentityProofInvalidError,
  IdentityProofUnverifiableError,
} from "../shared/errors/identity-errors.js";
import { Clock } from "../time/clock.js";
import { AuthConfig } from "./auth.config.js";

/**
 * Âge maximal d'une preuve : **cinq minutes**.
 *
 * Assez pour qu'une popup, un consentement et un aller-retour réseau tiennent
 * dedans ; assez court pour qu'un jeton récupéré ailleurs ne serve plus le
 * lendemain. Ce n'est PAS un anti-rejeu : pendant ces cinq minutes le même
 * jeton rattache autant de fois qu'on veut, et `iat` date l'émission, pas
 * l'authentification. C'est accepté — rejouer demande de tenir **en plus** une
 * session du compte cible, c'est-à-dire d'être déjà dedans.
 */
export const IDENTITY_PROOF_MAX_AGE_SECONDS = 5 * 60;

/** Ce qu'un id_token PROUVE, et rien de plus : le sujet qui l'a obtenu. */
export interface VerifiedIdentityProof {
  /** Le `sub` du compte tiers, tel que le tenant le nomme. */
  readonly subject: string;
}

/**
 * Vérifie un **id_token** émis à la SPA boutique, et rend le `sub` qu'il prouve.
 *
 * Même mécanique JWKS qu'`AccessTokenVerifier` (même tenant, mêmes clés,
 * résolution paresseuse pour n'appeler personne à l'amorçage), mais un jeton
 * d'une **autre nature** : un id_token s'adresse à une application, pas à une
 * API. Son audience est donc le `client_id` de la SPA, jamais l'identifiant de
 * notre API — accepter l'un pour l'autre laisserait un access token servir de
 * preuve d'identité.
 *
 * Ce que ce vérificateur ne fait pas, et ne peut pas faire : le `nonce`. Il est
 * posé et contrôlé par le SDK dans le navigateur ; nous ne l'avons jamais vu.
 * La fraîcheur ({@link IDENTITY_PROOF_MAX_AGE_SECONDS}) est ce qui borne la
 * fenêtre, pas ce qui empêche le rejeu.
 */
@Injectable()
export class IdTokenVerifier {
  private keySet: JWTVerifyGetKey | undefined;

  constructor(
    private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {IdentityProofUnverifiableError} l'application cliente n'est pas
   *   déclarée : on ne compare pas une audience à rien.
   * @throws {IdentityProofInvalidError} signature, émetteur, audience, `azp` ou
   *   `sub` refusés.
   * @throws {IdentityProofExpiredError} la preuve a plus de cinq minutes.
   */
  async verify(idToken: string): Promise<VerifiedIdentityProof> {
    const clientId = this.config.customerClientId;
    if (clientId === null) {
      throw new IdentityProofUnverifiableError();
    }

    // Signature, `iss`, `aud` et `exp` d'un coup : `jose` les refuse tous par
    // des erreurs qui lui sont propres, qu'on rhabille en refus nommé — une
    // erreur de bibliothèque sortirait en 500 anonyme.
    const payload = await this.readPayload(idToken, clientId);

    assertAuthorizedParty(payload, clientId);
    this.assertFresh(payload);

    const subject = payload.sub;
    if (subject === undefined || subject === "") {
      throw new IdentityProofInvalidError();
    }
    return { subject };
  }

  private async readPayload(idToken: string, clientId: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(idToken, this.keys(), {
        issuer: this.config.issuer,
        audience: clientId,
        // `exp` et `nbf` se mesurent contre le port `Clock`, pas contre
        // l'horloge murale que `jose` prendrait par défaut : une seule source
        // de temps par requête, et une expiration testable sans attendre.
        currentDate: this.clock.now(),
      });
      return payload;
    } catch (cause) {
      throw new IdentityProofInvalidError(cause);
    }
  }

  /**
   * `iat` de moins de cinq minutes, lu par le port `Clock` — jamais `Date.now()`.
   *
   * Un `iat` absent, illisible ou **dans le futur** est refusé comme invalide :
   * une horloge d'émetteur qui avance ouvrirait la fenêtre d'autant.
   */
  private assertFresh(payload: JWTPayload): void {
    const issuedAt = payload.iat;
    if (typeof issuedAt !== "number") {
      throw new IdentityProofInvalidError();
    }
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    if (issuedAt > nowSeconds) {
      throw new IdentityProofInvalidError();
    }
    if (nowSeconds - issuedAt > IDENTITY_PROOF_MAX_AGE_SECONDS) {
      throw new IdentityProofExpiredError();
    }
  }

  /**
   * Le JWKS du tenant, résolu à la première vérification.
   *
   * `protected` pour que le test substitue une clé locale : signer un jeton
   * avec les vraies clés du tenant est impossible, et tester la fraîcheur ou
   * l'`azp` sur un jeton non signé ne prouverait rien de ce que la production
   * fait.
   */
  protected keys(): JWTVerifyGetKey {
    this.keySet ??= createRemoteJWKSet(this.config.jwksUri);
    return this.keySet;
  }
}

/**
 * `azp` = l'application à qui le jeton a été délivré — **seulement s'il est là**.
 *
 * OIDC ne l'impose que lorsque `aud` porte plusieurs valeurs. L'exiger
 * refuserait donc tous les jetons du cas NORMAL, celui d'une audience unique :
 * le contrôle porteur est `aud`, `azp` n'est qu'une vérification de plus quand
 * le jeton la permet.
 */
function assertAuthorizedParty(payload: JWTPayload, clientId: string): void {
  const authorizedParty = payload["azp"];
  if (authorizedParty === undefined) {
    return;
  }
  if (authorizedParty !== clientId) {
    throw new IdentityProofInvalidError();
  }
}
