import { UnreadableShelfReplyError } from "../../domain/errors/unreadable-shelf-reply.error.js";
import type { PublicShelfEraser } from "../../domain/ports/public-shelf-eraser.js";
import {
  PublicShelfStateReader,
  type PublicShelfState,
} from "../../domain/ports/public-shelf-state.reader.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { InMemoryShopShelfCache } from "../../infrastructure/in-memory-shop-shelf-cache.js";
import { PublicShelfCacheability } from "../public-shelf-cacheability.js";
import { PublicShelfFlagMemory } from "../public-shelf-flag-memory.js";
import { PublicShelfPurge } from "../public-shelf-purge.js";
import { ResilientPublicShelf } from "../resilient-public-shelf.js";
import { resilientAround, type ResilientRig } from "./shelf-cache-doubles.js";

/** Ce que fait un état public en panne. */
export type PublicShelfFailure = "throws" | "unreadable" | "hangs" | null;

/**
 * **Le rayon public en mémoire** : le drapeau (éteint par défaut, comme
 * l'objet), la version, et les purges reçues. On le casse à la main, et
 * `bumpDuringNextRead` monte la version entre deux relevés — une purge passée
 * pendant le calcul.
 */
export class InMemoryPublicShelf extends PublicShelfStateReader implements PublicShelfEraser {
  enabled = false;
  version = 0;
  purges = 0;
  reads = 0;
  failure: PublicShelfFailure = null;
  purgeFails = false;
  /** Appelé pendant le calcul : simule une écriture qui purge entre les deux relevés. */
  readonly writeDuringCompute = (): void => {
    this.version += 1;
  };

  read(): Promise<PublicShelfState> {
    this.reads += 1;
    switch (this.failure) {
      case "throws":
        return Promise.reject(new RangeError("objet des rayons injoignable"));
      case "unreadable":
        return Promise.reject(new UnreadableShelfReplyError("essai"));
      case "hangs":
        return new Promise<PublicShelfState>(() => undefined);
      case null:
        return Promise.resolve({ enabled: this.enabled, version: this.version });
    }
  }

  purge(): Promise<void> {
    this.purges += 1;
    return this.purgeFails
      ? Promise.reject(new UnreadableShelfReplyError("purge publique, statut 502"))
      : Promise.resolve();
  }
}

/** Le rayon public derrière le repli, partageant le disjoncteur du rayon pro. */
export interface PublicRig extends ResilientRig {
  readonly shelf: InMemoryPublicShelf;
  readonly publicShelf: ResilientPublicShelf;
  readonly cacheability: PublicShelfCacheability;
  readonly purge: PublicShelfPurge;
  /** L'horloge de la mémoire du drapeau : on l'avance pour la périmer. */
  readonly clock: FixedClock;
}

export function publicRig(shelf: InMemoryPublicShelf = new InMemoryPublicShelf()): PublicRig {
  const rig = resilientAround(new InMemoryShopShelfCache());
  const clock = new FixedClock(new Date(0));
  const publicShelf = new ResilientPublicShelf(
    shelf,
    shelf,
    rig.guard,
    rig.signals,
    new PublicShelfFlagMemory(clock),
  );
  return {
    ...rig,
    clock,
    shelf,
    publicShelf,
    cacheability: new PublicShelfCacheability(publicShelf, rig.signals),
    purge: new PublicShelfPurge(publicShelf, rig.signals),
  };
}
