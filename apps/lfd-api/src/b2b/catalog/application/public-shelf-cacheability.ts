import { Injectable } from "@nestjs/common";

import { ShelfCacheSignals } from "../domain/ports/shelf-cache-signals.js";
import { publicShelfVerdict } from "../domain/public-shelf-rules.js";
import { ResilientPublicShelf } from "./resilient-public-shelf.js";

/** Un rayon public, et s'il peut s'offrir à Workers Cache. */
export interface PublicShelfReply<T> {
  readonly view: T;
  readonly cacheable: boolean;
}

/**
 * **L'API décide de la cacheabilité, réponse par réponse** (C3,
 * `plan-cache-du-catalogue.md` § 3) : l'état du rayon public est relevé AVANT
 * le calcul et relu APRÈS ; la réponse ne se garde que si le drapeau est
 * allumé aux deux relevés et que la version n'a pas bougé
 * ({@link publicShelfVerdict}).
 *
 * Drapeau éteint au premier relevé : pas de second appel — la réponse ne se
 * gardera pas, quoi qu'il arrive. Le calcul, lui, a lieu dans tous les cas :
 * le rayon est TOUJOURS servi, le cache ne fait que décider s'il se garde.
 */
@Injectable()
export class PublicShelfCacheability {
  constructor(
    private readonly shelf: ResilientPublicShelf,
    private readonly signals: ShelfCacheSignals,
  ) {}

  async around<T>(compute: () => Promise<T>): Promise<PublicShelfReply<T>> {
    const before = await this.shelf.state();
    const view = await compute();
    const after = before?.enabled === true ? await this.shelf.state() : before;
    const verdict = publicShelfVerdict(before, after);
    this.signals.emit(
      verdict.cacheable
        ? { name: "public_cacheable" }
        : { name: "public_not_cacheable", reason: verdict.reason },
    );
    return { view, cacheable: verdict.cacheable };
  }
}
