import { UnreadableShelfReplyError } from "../domain/errors/unreadable-shelf-reply.error.js";
import {
  ShopShelfSwitch,
  type ShelfCacheState,
  type ShelfSwitchAction,
} from "../domain/ports/shop-shelf-switch.js";
import type { ShelfFetch } from "./durable-object-shop-shelf-cache.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";

/** Le chemin de l'interrupteur chez l'objet (contrat de `container/shelf-store.ts`). */
const SWITCH_PATH = "/switch";

/** Un geste d'exploitation attend plus qu'une lecture : personne n'attend un rayon derrière. */
const SWITCH_TIMEOUT_MS = 5000;

const HTTP_OK = 200;

/**
 * **L'interrupteur du Durable Object des rayons pro**, par le même chemin
 * interne que la lecture (`http://rayons.interne`, gestionnaire de sortie
 * du Worker). Une classe à part de `DurableObjectShopShelfCache` : elle ne
 * change pas pour la même raison (un geste d'exploitation, pas un rayon).
 */
export class DurableObjectShopShelfSwitch extends ShopShelfSwitch {
  constructor(
    private readonly origin: string,
    private readonly fetchFn: ShelfFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async apply(action: ShelfSwitchAction): Promise<ShelfCacheState> {
    assertOutsideTransaction("cache-des-rayons.switch");
    const response = await this.fetchFn(`${this.origin.replace(/\/+$/u, "")}${SWITCH_PATH}`, {
      method: "POST",
      body: JSON.stringify({ action }),
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(SWITCH_TIMEOUT_MS),
    });
    if (response.status !== HTTP_OK) {
      throw new UnreadableShelfReplyError(`interrupteur, statut ${response.status}`);
    }
    const state = stateOf(await response.json());
    if (state === null) {
      throw new UnreadableShelfReplyError("interrupteur, état illisible");
    }
    return state;
  }
}

function stateOf(body: unknown): ShelfCacheState | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const enabled: unknown = Reflect.get(body, "enabled");
  const publicEnabled: unknown = Reflect.get(body, "publicEnabled");
  const version: unknown = Reflect.get(body, "version");
  return typeof enabled === "boolean" &&
    typeof publicEnabled === "boolean" &&
    Number.isSafeInteger(version) &&
    typeof version === "number"
    ? { enabled, publicEnabled, version }
    : null;
}
