import { Injectable } from "@nestjs/common";

import { IdTokenVerifier } from "../../../platform/auth/id-token.verifier.js";
import {
  IdentityProofVerifier,
  type IdentityProof,
} from "../domain/ports/identity-proof.verifier.js";

/**
 * Adaptateur du port de preuve : l'`id_token` de la **SPA boutique**, vérifié
 * contre le JWKS du tenant ({@link IdTokenVerifier}, lot A).
 *
 * Il ne fait que déléguer, et c'est voulu : la mécanique du jeton — signature,
 * émetteur, audience de l'application cliente, fraîcheur — appartient à
 * `platform/auth/`, qui la partage avec les deux autres vérificateurs. Ce
 * fichier n'existe que pour que le handler dépende d'une abstraction de son
 * contexte plutôt que d'une classe technique (DIP), et qu'un test puisse jouer
 * la preuve sans fabriquer de paire de clés.
 */
@Injectable()
export class Auth0IdentityProofVerifier extends IdentityProofVerifier {
  constructor(private readonly tokens: IdTokenVerifier) {
    super();
  }

  verify(idToken: string): Promise<IdentityProof> {
    return this.tokens.verify(idToken);
  }
}
