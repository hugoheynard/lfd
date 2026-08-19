import { EstablishmentDirectory } from "../../src/b2b/account/domain/ports/establishment-directory.js";

/**
 * Double du seed pour {@link EstablishmentDirectory} : **aucun appel réseau**
 * pendant le seed (sinon 1 requête gouv.fr par société). Rend toujours `null` —
 * le NAF des sociétés de démo est posé en **fixture** depuis le persona
 * (`phase-activation`), pas résolu par l'API.
 */
export class FakeEstablishmentDirectory extends EstablishmentDirectory {
  resolveNaf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
