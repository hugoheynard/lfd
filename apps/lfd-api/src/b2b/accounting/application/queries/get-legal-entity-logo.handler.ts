import type { Buffer } from "node:buffer";

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { EntityLogoUnreadableError } from "../../domain/errors/accounting-errors.js";
import { LegalEntityLogoReader } from "../../domain/ports/legal-entity-logo.reader.js";
import { entityLogoContentType } from "../../domain/value-objects/entity-logo.js";
import { GetLegalEntityLogoQuery } from "./legal-entity-queries.js";

/** Les octets du logo et ce qu'ils sont, prêts à partir sur le fil. */
export interface LegalEntityLogo {
  readonly bytes: Buffer;
  readonly contentType: string;
}

/**
 * Sert le logo courant d'une entité, ou `null`.
 *
 * ## `readIfPresent`, et pas `read`
 *
 * Une entité sans logo est le cas COURANT, pas une anomalie : `read` traite
 * l'absence en panne — c'est son contrat — et ferait donc crier le journal sur
 * un chemin parfaitement sain. Pire, l'envelopper d'un `try/catch` qui rend
 * `null` avalerait les vraies pannes : un bucket mal nommé deviendrait « pas de
 * logo », et le symptôme d'un stockage cassé serait l'absence de symptôme.
 *
 * Ici l'absence est une RÉPONSE, et une panne reste une panne qui lève.
 *
 * ## Le type est relu dans les octets
 *
 * Aucune colonne ne le porte : la base ne garde que la clé. Le relire coûte huit
 * comparaisons et évite une colonne qui pourrait mentir sur ce qu'on sert — ce
 * qui, sur du contenu déposé, est la moitié d'un XSS stocké.
 */
@QueryHandler(GetLegalEntityLogoQuery)
export class GetLegalEntityLogoHandler implements IQueryHandler<
  GetLegalEntityLogoQuery,
  LegalEntityLogo | null
> {
  constructor(
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
  ) {}

  async execute(query: GetLegalEntityLogoQuery): Promise<LegalEntityLogo | null> {
    const key = await this.logos.logoKeyOf(query.legalEntityId);
    if (key === null) {
      return null;
    }
    const bytes = await this.store.readIfPresent(key);
    if (bytes === null) {
      // La base promet un logo que le bucket n'a pas. Ce n'est pas une panne du
      // canal — il a répondu —, et ce n'est pas non plus un état que le produit
      // sait produire : on le sert comme une absence plutôt que d'échouer, et le
      // geste de sortie (redéposer) est le même.
      return null;
    }
    const contentType = entityLogoContentType(bytes);
    if (contentType === null) {
      throw new EntityLogoUnreadableError(query.legalEntityId);
    }
    return { bytes, contentType };
  }
}
