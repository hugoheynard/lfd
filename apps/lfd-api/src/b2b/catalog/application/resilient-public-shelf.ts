import { Injectable } from "@nestjs/common";

import { PublicShelfEraser } from "../domain/ports/public-shelf-eraser.js";
import {
  PublicShelfStateReader,
  type PublicShelfState,
} from "../domain/ports/public-shelf-state.reader.js";
import { ShelfCacheSignals } from "../domain/ports/shelf-cache-signals.js";
import { PublicShelfFlagMemory } from "./public-shelf-flag-memory.js";
import { ShelfCallGuard } from "./shelf-call-guard.js";

/**
 * **Le rayon public derrière le même repli que le rayon pro** (C3,
 * `plan-cache-du-catalogue.md` § 4 bis) : même délai, même disjoncteur
 * ({@link ShelfCallGuard}). Rien de ce qui sort d'ici ne lève.
 *
 * Tout relevé réussi range l'état du drapeau dans {@link PublicShelfFlagMemory} ;
 * la version, jamais.
 */
@Injectable()
export class ResilientPublicShelf {
  constructor(
    private readonly reader: PublicShelfStateReader,
    private readonly eraser: PublicShelfEraser,
    private readonly guard: ShelfCallGuard,
    private readonly signals: ShelfCacheSignals,
    private readonly flag: PublicShelfFlagMemory,
  ) {}

  /** Le drapeau et la version, ou `null` : magasin injoignable, lent, ou disjoncteur ouvert. */
  async state(): Promise<PublicShelfState | null> {
    const state = await this.guard.call("public_state", () => this.reader.read(), true);
    if (state !== null) {
      this.flag.remember(state.enabled);
    }
    return state;
  }

  /** Le drapeau est-il connu éteint depuis moins de 5 s ? Ne lit pas l'objet. */
  knownDisabled(): boolean {
    return this.flag.knownDisabled();
  }

  /** Une bascule dans cette instance : le prochain relevé relit l'objet. */
  forgetFlag(): void {
    this.flag.forget();
  }

  /**
   * Purge Workers Cache ; `false` si la purge n'a pas abouti. Hors
   * disjoncteur, comme l'effacement des rayons pro : c'est elle qui rattrape
   * un rayon public devenu faux.
   */
  async purge(): Promise<boolean> {
    const done = await this.guard.call(
      "public_purge",
      () => this.eraser.purge().then(() => true),
      false,
    );
    this.signals.emit({ name: done === null ? "public_purge_failed" : "public_purged" });
    return done !== null;
  }
}
