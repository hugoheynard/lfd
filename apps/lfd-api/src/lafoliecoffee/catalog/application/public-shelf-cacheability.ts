import { Injectable } from "@nestjs/common";

import { ShelfCacheSignals } from "../domain/ports/shelf-cache-signals.js";
import { publicShelfVerdict, type PublicShelfVerdict } from "../domain/public-shelf-rules.js";
import { ResilientPublicShelf } from "./resilient-public-shelf.js";

/** Un rayon public, et s'il peut s'offrir à Workers Cache. */
export type PublicShelfReply<T> = { readonly view: T } & PublicShelfVerdict;

/**
 * **L'API décide de la cacheabilité, réponse par réponse** (C3,
 * `le-rayon-en-cache.md` § 3) : l'état du rayon public est relevé AVANT
 * le calcul et relu APRÈS ; la réponse ne se garde que si le drapeau est
 * allumé aux deux relevés et que la version n'a pas bougé
 * ({@link publicShelfVerdict}).
 *
 * Drapeau connu éteint depuis moins de 5 s (`PublicShelfFlagMemory`) : aucun
 * relevé du tout. Sinon, les deux relevés lisent l'objet — la version ne
 * vient jamais de la mémoire.
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
    if (this.shelf.knownDisabled()) {
      const view = await compute();
      this.signals.emit({ name: "public_not_cacheable", reason: "disabled" });
      return { view, cacheable: false, reason: "disabled" };
    }
    const before = await this.shelf.state();
    const view = await compute();
    const after = before?.enabled === true ? await this.shelf.state() : before;
    const verdict = publicShelfVerdict(before, after);
    this.signals.emit(
      verdict.cacheable
        ? { name: "public_cacheable" }
        : { name: "public_not_cacheable", reason: verdict.reason },
    );
    return { view, ...verdict };
  }
}
