import type { LegalEntity } from "../domain/entities/legal-entity.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { LegalEntityRepository } from "../domain/ports/legal-entity.repository.js";

/**
 * Charge l'entité, ou refuse en 404.
 *
 * Six handlers commencent par ces trois lignes. Les recopier n'est pas cher ;
 * ce qui l'est, c'est qu'un septième les recopie **presque** — un `?? null` qui
 * devient un `undefined`, une erreur générique au lieu de celle qui nomme
 * l'identifiant. Le refus a une seule forme parce qu'il est écrit une seule
 * fois.
 */
export async function loadOrFail(
  repository: LegalEntityRepository,
  legalEntityId: string,
): Promise<LegalEntity> {
  const entity = await repository.load(legalEntityId);
  if (entity === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }
  return entity;
}

/**
 * La clé de stockage du logo — **ancrée sur l'entité**, jamais composée à partir
 * d'une donnée reçue.
 *
 * C'est ici qu'est le mur du stockage : un appelant ne choisit pas l'objet qu'il
 * lit ou écrit, il nomme une entité dont il a vérifié l'identifiant, et la clé
 * s'en déduit. C'est aussi ce qui fait qu'un remplacement reste un remplacement
 * — même entité, même clé, l'objet précédent est écrasé plutôt qu'accumulé.
 *
 * Sans extension : le type réel est relu dans les octets au moment de servir, et
 * une extension en dur mentirait le jour où un JPEG remplace un PNG.
 */
export function legalEntityLogoKey(legalEntityId: string): string {
  return `legal-entities/${legalEntityId}/logo`;
}
