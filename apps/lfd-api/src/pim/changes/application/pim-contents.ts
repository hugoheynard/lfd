import { Injectable } from "@nestjs/common";

import {
  type ContentGuard,
  VersionedContents,
} from "../../../platform/day-versions/versioned-contents.js";
import { PimChangeVersionReader } from "../domain/ports/pim-change-version.reader.js";

/**
 * **Un contenu du référentiel servi sous le numéro `pim`**
 * (`plan-lectures-du-pim.md`, § 4.2) : tant que le numéro ne bouge pas, la
 * charge rangée dans l'objet est servie sans relire la base.
 *
 * Un contenu rangé ici ne dépend PAS de l'appelant : il est le même pour tout
 * porteur du droit de sa route. Ce qui en dépend se lit à part.
 *
 * Une clé `null` (un identifiant que l'objet n'accepte pas) lit la base, sans
 * rien ranger.
 */
export abstract class PimContents {
  abstract contentOf<T>(
    key: string | null,
    load: () => Promise<T>,
    accepts: ContentGuard<T>,
  ): Promise<T>;
}

/**
 * L'implémentation par {@link VersionedContents}.
 *
 * 🔴 Le numéro est lu AVANT les données, jamais en même temps : une écriture
 * validée entre les deux fait monter le numéro après celui sous lequel la
 * charge est rangée, et la prochaine lecture la relit. Lu après, il
 * couvrirait une écriture que la charge n'a pas.
 */
@Injectable()
export class VersionedPimContents extends PimContents {
  constructor(
    private readonly versions: PimChangeVersionReader,
    private readonly contents: VersionedContents,
  ) {
    super();
  }

  async contentOf<T>(
    key: string | null,
    load: () => Promise<T>,
    accepts: ContentGuard<T>,
  ): Promise<T> {
    if (key === null) {
      return load();
    }
    const version = await this.versions.versionOf();
    return this.contents.contentOf(key, version, load, accepts);
  }
}
