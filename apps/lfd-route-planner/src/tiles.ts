/**
 * Les tuiles de la carte des tournées, servies depuis R2 (plan de tournée,
 * lot 10 ter, L10t-C1 à C3 — documentation/livraisons/tournees/plan-preparation-de-tournee.md).
 *
 * Le bucket `lfd-map-tiles` porte chaque fabrication sous un préfixe DATÉ
 * (`AAAA-MM-JJ/rues.pmtiles`, `AAAA-MM-JJ/relief.pmtiles`) et un `current.json`
 * qui désigne le préfixe en service. La bascule d'une carte à la suivante est
 * l'écriture de ce seul fichier : on le lit à chaque requête, donc un retour
 * arrière (le réécrire) prend effet sans redéployer.
 *
 * MapLibre lit un PMTiles **par plages** : l'en-tête, puis le répertoire, puis
 * chaque tuile. Les requêtes partielles sont donc le cas normal, pas une
 * optimisation.
 *
 * Aucun import du monde Workers au-delà des types : fonctions sur
 * `Request`/`Response`, exécutables sous Node pour les tests.
 */

/** Ce que ce module lit d'un objet R2 — un sous-ensemble de `R2Object`. */
export interface TileObject {
  readonly size: number;
  readonly httpEtag: string;
}

/** Un objet lu, avec son corps — un sous-ensemble de `R2ObjectBody`. */
export interface TileObjectBody extends TileObject {
  readonly body: ReadableStream;
  text(): Promise<string>;
}

/**
 * Le port de lecture du bucket : les deux méthodes appelées, rien d'autre.
 * `R2Bucket` le satisfait tel quel ; les tests le doublent à la main.
 */
export interface TileBucket {
  head(key: string): Promise<TileObject | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<TileObjectBody | null>;
}

/** Le chemin servi, préfixe compris : tout ce qui commence par lui est à ce module. */
export const TILES_PATH = "/tiles";

/** Le fichier qui désigne la fabrication en service. Écrit EN DERNIER par le workflow. */
export const CURRENT_POINTER_KEY = "current.json";

/** Les deux fichiers servis, par nom public. Tout autre nom est un 404 sans détail. */
const SERVED_FILES: ReadonlySet<string> = new Set(["rues.pmtiles", "relief.pmtiles"]);

const DATED_PREFIX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Un jour. L'adresse (`/tiles/rues.pmtiles`) ne porte PAS la version : un cache
 * plus long garderait la carte précédente des semaines après la bascule. Un
 * mélange de deux versions reste sans dommage — l'`ETag` change avec l'objet,
 * et le lecteur PMTiles relit tout quand il le voit changer.
 */
const CACHE_CONTROL = "public, max-age=86400";

const PMTILES_CONTENT_TYPE = "application/vnd.pmtiles";

/** Ce chemin appartient-il aux tuiles ? (`/tilesX` non.) */
export function isTilesPath(pathname: string): boolean {
  return pathname === TILES_PATH || pathname.startsWith(`${TILES_PATH}/`);
}

/** Sert `GET|HEAD /tiles/{rues,relief}.pmtiles`. Ne touche qu'au bucket. */
export async function serveTiles(request: Request, bucket: TileBucket): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const file = new URL(request.url).pathname.slice(`${TILES_PATH}/`.length);
  if (!SERVED_FILES.has(file)) {
    return notFound();
  }
  const prefix = await currentPrefix(bucket);
  if (prefix === null) {
    return new Response("Carte indisponible.", { status: 503 });
  }
  const key = `${prefix}/${file}`;
  const object = await bucket.head(key);
  if (object === null) {
    return notFound();
  }
  const range = requestedRange(request.headers.get("range"), object.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders(object), "content-range": `bytes */${object.size}` },
    });
  }
  return range === null
    ? whole(request, bucket, key, object)
    : partial(request, bucket, key, object, range);
}

/**
 * Le préfixe en service, ou `null` si `current.json` manque ou ne désigne pas
 * un préfixe daté — jamais une clé arbitraire lue dans un fichier.
 */
async function currentPrefix(bucket: TileBucket): Promise<string | null> {
  const pointer = await bucket.get(CURRENT_POINTER_KEY);
  if (pointer === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(await pointer.text());
    const prefix =
      typeof parsed === "object" && parsed !== null && "prefix" in parsed
        ? parsed.prefix
        : undefined;
    return typeof prefix === "string" && DATED_PREFIX.test(prefix) ? prefix : null;
  } catch {
    return null;
  }
}

/** Une plage résolue, bornes incluses. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Résout l'en-tête `Range` contre la taille de l'objet.
 *
 * - absent, multiple ou mal formé → `null` : on sert le fichier entier (un
 *   serveur peut ignorer un `Range` qu'il ne sait pas lire, RFC 9110 §14.2) ;
 * - `bytes=a-b`, `bytes=a-`, `bytes=-n` → la plage, bornée à la fin du fichier ;
 * - début au-delà de la fin, ou suffixe nul → `"unsatisfiable"` (416).
 */
export function requestedRange(
  header: string | null,
  size: number,
): ByteRange | "unsatisfiable" | null {
  const match = header === null ? null : SINGLE_RANGE.exec(header.trim());
  if (match === null) {
    return null;
  }
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") {
    return null;
  }
  if (first === "") {
    const suffix = Number(last);
    return suffix === 0 || size === 0
      ? "unsatisfiable"
      : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (last !== "" && Number(last) < start) {
    return null;
  }
  if (start >= size) {
    return "unsatisfiable";
  }
  return { start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}

async function whole(
  request: Request,
  bucket: TileBucket,
  key: string,
  object: TileObject,
): Promise<Response> {
  const headers = { ...commonHeaders(object), "content-length": String(object.size) };
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  const body = await bucket.get(key);
  return body === null ? notFound() : new Response(body.body, { status: 200, headers });
}

async function partial(
  request: Request,
  bucket: TileBucket,
  key: string,
  object: TileObject,
  range: ByteRange,
): Promise<Response> {
  const length = range.end - range.start + 1;
  const headers = {
    ...commonHeaders(object),
    "content-length": String(length),
    "content-range": `bytes ${range.start}-${range.end}/${object.size}`,
  };
  if (request.method === "HEAD") {
    return new Response(null, { status: 206, headers });
  }
  const body = await bucket.get(key, { range: { offset: range.start, length } });
  return body === null ? notFound() : new Response(body.body, { status: 206, headers });
}

/**
 * Le back-office est servi par Pages (`lfd-backoffice.pages.dev`), pas par la
 * zone de la passerelle : sa lecture des tuiles est d'une AUTRE origine, et
 * sans ces en-têtes le navigateur la refuse — la carte de production ne se
 * chargeait pas (relevé au bâti, 2026-09-29). `*` et non une liste : ce sont
 * des données publiques (OSM, IGN), sans cookie ni jeton. Une plage simple
 * (`bytes=a-b`) est un en-tête « sûr » : aucune requête préalable OPTIONS.
 */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "ETag, Content-Range, Content-Length, Accept-Ranges",
} as const;

function commonHeaders(object: TileObject): Record<string, string> {
  return {
    ...CORS_HEADERS,
    "accept-ranges": "bytes",
    etag: object.httpEtag,
    "cache-control": CACHE_CONTROL,
    "content-type": PMTILES_CONTENT_TYPE,
  };
}

/** Un 404 nu : il ne dit ni ce qui est servi, ni ce que porte le bucket. */
function notFound(): Response {
  return new Response(null, { status: 404 });
}
