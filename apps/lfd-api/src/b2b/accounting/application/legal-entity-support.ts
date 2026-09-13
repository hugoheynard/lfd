import type { Buffer } from "node:buffer";

import { Logger } from "@nestjs/common";

import type { DocumentStore } from "../../../platform/storage/document-store.js";
import type { LegalEntity } from "../domain/entities/legal-entity.js";
import type { LegalEntityLogoReader } from "../domain/ports/legal-entity-logo.reader.js";
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

const logger = new Logger("EntityLogo");

/**
 * Les octets du logo de l'entité, ou `null` — **et le bruit qui va avec**.
 *
 * Trois lecteurs faisaient ces deux lignes : l'écran du logo, la fiche exemple
 * et l'aperçu nominatif. Elles se ressemblaient assez pour qu'un quatrième les
 * recopie, et assez peu pour qu'il oublie celle qui compte.
 *
 * 🔴 **Ce qu'elle porte est un contrôle de cohérence, pas une lecture.** La
 * colonne `logo_key` n'est renseignée qu'APRÈS que l'objet est rangé
 * (`SetLegalEntityLogoHandler`), et le retrait efface la clé sans toucher au
 * bucket : le produit ne sait donc pas fabriquer le couple « clé en base, rien
 * derrière ». Le rencontrer veut dire qu'on regarde un autre stockage que celui
 * qui a reçu le dépôt, ou qu'un objet a été retiré à la main.
 *
 * Constaté le 2026-09-12 en développement sur l'unique entité (`Crazeativity`),
 * dont la `logo_key` est renseignée en base locale. On sert l'absence — un
 * mandat sans rond reste valide, c'est le formulaire de la norme — mais on le
 * DIT, parce que le seul symptôme visible autrement est un logo qui manque sur
 * un document qu'on n'imprime pas tous les jours.
 */
export async function readEntityLogo(
  logos: LegalEntityLogoReader,
  store: DocumentStore,
  legalEntityId: string,
): Promise<Buffer | null> {
  const key = await logos.logoKeyOf(legalEntityId);
  if (key === null) {
    return null;
  }
  const bytes = await store.readIfPresent(key);
  if (bytes === null) {
    logger.warn(
      `L'entité « ${legalEntityId} » annonce un logo en base que le stockage n'a pas ` +
        `(clé « ${key} »). Le document sort sans logo ; redéposer la pièce referme l'écart.`,
    );
  }
  return bytes;
}
