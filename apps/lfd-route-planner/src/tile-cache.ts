/**
 * Le cache des tuiles (2026-11-01, décision de Hugo) : une plage de 16 Ko
 * prenait 0,6 à 2,3 s depuis l'extérieur, sans aucun `cf-cache-status` —
 * chaque requête faisait trois lectures R2 en série (`current.json`, `head`,
 * la plage), et rien n'était gardé.
 *
 * Deux étages :
 *
 * 1. **en mémoire du Worker**, quelques minutes ({@link TILE_METADATA_TTL_MS}) :
 *    le préfixe en service et l'en-tête (`head`) du fichier. Une bascule de
 *    carte (`current.json` réécrit) prend donc effet en au plus ce délai,
 *    plus « sans redéployer » qu'à la requête près ;
 * 2. **dans le cache de Cloudflare** (`caches.default`, port {@link TileCache}) :
 *    chaque plage lue, sous une clé qui porte le préfixe DATÉ. Ce préfixe est
 *    immuable — une fabrication ne se réécrit pas, la suivante en prend un
 *    autre —, donc la clé change quand la carte change, et l'entrée peut
 *    vivre longtemps ({@link CACHED_RANGE_CONTROL}).
 *
 * ⚠️ Le cache de Cloudflare refuse de ranger un `206` : la plage s'y range en
 * `200` avec son seul corps, et la réponse partielle se reconstruit à la
 * sortie avec les en-têtes de l'objet.
 */
import type { ByteRange, TileObject } from "./tiles";

/**
 * Le port du cache de réponses : les deux méthodes appelées. `caches.default`
 * le satisfait tel quel (clé = une URL en chaîne) ; les tests le doublent.
 */
export interface TileCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

/** Cinq minutes : le délai au-delà duquel une bascule de carte est vue. */
export const TILE_METADATA_TTL_MS = 5 * 60_000;

/** Un an, immuable : la clé porte le préfixe daté, elle ne désigne jamais deux contenus. */
export const CACHED_RANGE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Une URL qui n'est servie par personne : seulement une clé de cache, propre
 * à ce Worker. Le cache de Cloudflare exige une URL.
 */
const CACHE_KEY_ORIGIN = "https://lfd-route-planner.tile-cache";

/** La clé d'une plage : préfixe daté + fichier + plage. */
export function rangeCacheKey(prefix: string, file: string, range: ByteRange): string {
  return `${CACHE_KEY_ORIGIN}/${prefix}/${file}?bytes=${String(range.start)}-${String(range.end)}`;
}

/**
 * La mémoire courte du Worker : une valeur lue, gardée jusqu'à son échéance.
 * Un `null` (pointeur absent, fichier absent) ne se garde PAS : la carte qui
 * arrive doit se voir à la requête suivante.
 *
 * Elle vit autant que l'isolat du Worker — Cloudflare en recycle quand il
 * veut, et la mémoire repart vide, sans dommage.
 */
export class TileMetadataMemo {
  private readonly prefixes = new Map<string, Remembered<string>>();
  private readonly heads = new Map<string, Remembered<TileObject>>();

  constructor(
    private readonly now: () => number,
    private readonly ttlMs: number = TILE_METADATA_TTL_MS,
  ) {}

  /** Le préfixe en service, lu au plus une fois par délai. */
  prefix(read: () => Promise<string | null>): Promise<string | null> {
    return this.remember(this.prefixes, "current", read);
  }

  /** L'en-tête d'un objet, lu au plus une fois par délai et par clé. */
  head(key: string, read: () => Promise<TileObject | null>): Promise<TileObject | null> {
    return this.remember(this.heads, key, read);
  }

  private async remember<T>(
    entries: Map<string, Remembered<T>>,
    key: string,
    read: () => Promise<T | null>,
  ): Promise<T | null> {
    const at = this.now();
    const entry = entries.get(key);
    if (entry !== undefined && entry.until > at) {
      return entry.value;
    }
    const value = await read();
    if (value !== null) {
      entries.set(key, { value, until: at + this.ttlMs });
    }
    return value;
  }
}

/** Une valeur gardée, et l'instant (ms) où elle cesse de l'être. */
interface Remembered<T> {
  readonly value: T;
  readonly until: number;
}

/** Ce que le service des tuiles reçoit pour cacher : le cache, la mémoire, et de quoi ranger après la réponse. */
export interface TileCaching {
  readonly cache: TileCache;
  readonly memo: TileMetadataMemo;
  /** `ctx.waitUntil` : ranger au cache ne retarde pas la réponse. */
  defer(work: Promise<unknown>): void;
}

/** Aucun cache : chaque requête relit tout. Le défaut sous test, et le comportement d'avant le 2026-11-01. */
export function noTileCaching(): TileCaching {
  return {
    cache: {
      match: () => Promise.resolve(undefined),
      put: () => Promise.resolve(),
    },
    memo: new TileMetadataMemo(() => 0, 0),
    defer: () => undefined,
  };
}
