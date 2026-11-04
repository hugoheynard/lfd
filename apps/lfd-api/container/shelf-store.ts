// Les décisions de l'objet des rayons pro (`documentation/pricing/moteur/plan-cache-du-catalogue.md`,
// lot C2) : qui peut l'appeler, ce qu'une lecture rend, quand un rangement
// est refusé, ce qu'un effacement emporte.
//
// Isolé de `worker.ts` pour la même raison que `edge-guard.ts` : le rendre
// testable. Zéro import, des fonctions pures, exécutables sous Node comme
// sous Workers. `worker.ts` ne fait que relier ces décisions au stockage
// SQLite de l'objet — il ne doit en contenir aucune.
//
// L'objet ne lit JAMAIS l'heure : l'API lui passe son instant (`now`, sur son
// `Clock`) à la lecture, et l'échéance au rangement. Une seule horloge décide
// de l'âge d'un rayon, celle que `lint:clock-port` tient.

/**
 * L'hôte fictif que le conteneur appelle, et que le Worker intercepte
 * (gestionnaire de sortie). En `http://` : seul l'HTTP est intercepté par
 * défaut, une adresse `https://` partirait sur internet (§ 1).
 */
export const SHELF_STORE_HOST = "rayons.interne";

/** L'adresse complète, posée par le Worker dans l'environnement du conteneur. */
export const SHELF_STORE_ORIGIN = `http://${SHELF_STORE_HOST}`;

/** Le nom de la variable que `AppConfig.shopShelfCacheUrl()` lit. */
export const SHELF_STORE_ENV = "SHOP_SHELF_CACHE_URL";

/** L'en-tête qui porte la version courante sur un raté. */
export const SHELF_VERSION_HEADER = "x-shelf-version";

/** La clé de l'espace perso dans le stockage — jamais confondable avec une société. */
const PERSONAL_KEY = "personal";
const COMPANY_PREFIX = "company:";

/** Un appel compris par l'objet. */
export type ShelfCall =
  | { readonly kind: "read"; readonly key: string; readonly nowMs: number }
  | {
      readonly kind: "store";
      readonly key: string;
      readonly version: number;
      readonly expiresAtMs: number;
      readonly principalId: string | null;
    }
  | { readonly kind: "erase" }
  | { readonly kind: "switch" }
  | { readonly kind: "public_state" };

/**
 * Un geste de l'interrupteur (`plan-cache-du-catalogue.md`, « L'interrupteur ») :
 * éteindre, rallumer, vider — et, depuis C3, allumer ou éteindre le rayon
 * PUBLIC seul. La même liste que la route machine de l'API.
 */
export type ShelfSwitchAction = "on" | "off" | "purge" | "public-on" | "public-off";

const SWITCH_ACTIONS: readonly ShelfSwitchAction[] = [
  "on",
  "off",
  "purge",
  "public-on",
  "public-off",
];

/** Ce qu'un geste de l'interrupteur fait au stockage. */
export interface ShelfSwitchPlan {
  /** L'état à écrire, ou `null` pour le laisser tel quel (une purge n'allume rien). */
  readonly enabled: boolean | null;
  /** Le drapeau du rayon public (C3), ou `null` pour le laisser tel quel. */
  readonly publicEnabled: boolean | null;
  /** Effacer toutes les entrées ET monter la version — comme l'effacement « tout ». */
  readonly eraseAll: boolean;
}

/** Ce qu'un rangement devient, avant toute écriture. */
export type ShelfStoreDecision = "stored" | "stale" | "not_kept";

/** Le chemin de l'interrupteur, appelé par l'API seulement (même garde que le reste). */
export const SHELF_SWITCH_PATH = "/switch";

/**
 * L'état du rayon public (C3) : son drapeau et la version courante, que l'API
 * relève avant ET après le calcul d'un rayon public.
 */
export const PUBLIC_SHELF_STATE_PATH = "/public/state";

/** Ce qu'un effacement demande — la même forme que `ShelfPurgeOrder` côté API. */
export type ShelfEraseOrder =
  { readonly kind: "all" } | { readonly kind: "companies"; readonly companyIds: readonly string[] };

/** Une entrée rangée, sans son rayon : ce que les décisions lisent. */
export interface ShelfEntryMeta {
  readonly key: string;
  readonly principalId: string | null;
}

/**
 * **Le contrôle de l'appelant** : seul le conteneur `Backend` joint l'objet.
 * `ContainerProxy` est un point d'entrée exporté, qu'un autre Worker du compte
 * pourrait lier sans les `props` d'un conteneur — d'où l'exigence d'un
 * `containerId` connu, comparé à TOUS les identifiants admis, sans supposer
 * qu'il n'y en a qu'un (§ 4).
 */
export function isTrustedCaller(
  containerId: string | undefined,
  trustedIds: readonly string[],
): boolean {
  return containerId !== undefined && containerId !== "" && trustedIds.includes(containerId);
}

/** La clé de stockage d'un chemin `/shelves/personal` ou `/shelves/company/<id>`. */
export function storageKeyOf(pathname: string): string | null {
  if (pathname === "/shelves/personal") {
    return PERSONAL_KEY;
  }
  const match = /^\/shelves\/company\/([^/]+)$/u.exec(pathname);
  if (match === null) {
    return null;
  }
  const companyId = safeDecode(match[1] ?? "");
  return companyId === null || companyId === "" ? null : `${COMPANY_PREFIX}${companyId}`;
}

/** La société d'une clé de stockage ; `null` pour l'espace perso. */
export function companyOfStorageKey(key: string): string | null {
  return key.startsWith(COMPANY_PREFIX) ? key.slice(COMPANY_PREFIX.length) : null;
}

/** Lit un appel ; `null` = rien que l'objet comprenne (400). */
export function parseShelfCall(method: string, url: URL): ShelfCall | null {
  if (method === "POST" && url.pathname === "/erase") {
    return { kind: "erase" };
  }
  if (method === "POST" && url.pathname === SHELF_SWITCH_PATH) {
    return { kind: "switch" };
  }
  if (method === "GET" && url.pathname === PUBLIC_SHELF_STATE_PATH) {
    return { kind: "public_state" };
  }
  const key = storageKeyOf(url.pathname);
  if (key === null) {
    return null;
  }
  if (method === "GET") {
    const nowMs = wholeNumber(url.searchParams.get("now"));
    return nowMs === null ? null : { kind: "read", key, nowMs };
  }
  if (method === "PUT") {
    const version = wholeNumber(url.searchParams.get("version"));
    const expiresAtMs = wholeNumber(url.searchParams.get("expires"));
    const principal = url.searchParams.get("principal");
    return version === null || expiresAtMs === null
      ? null
      : {
          kind: "store",
          key,
          version,
          expiresAtMs,
          principalId: principal === "" ? null : principal,
        };
  }
  return null;
}

/** Lit le corps d'un effacement ; `null` = illisible (400). */
export function parseEraseOrder(body: unknown): ShelfEraseOrder | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const kind: unknown = Reflect.get(body, "kind");
  if (kind === "all") {
    return { kind: "all" };
  }
  const ids: unknown = Reflect.get(body, "companyIds");
  if (kind !== "companies" || !Array.isArray(ids)) {
    return null;
  }
  const companyIds = ids.filter((id): id is string => typeof id === "string" && id !== "");
  return companyIds.length === ids.length ? { kind: "companies", companyIds } : null;
}

/** Une entrée sert tant que son échéance n'est pas atteinte à l'instant de l'API. */
export function isFresh(expiresAtMs: number, nowMs: number): boolean {
  return nowMs < expiresAtMs;
}

/**
 * **Le refus de version** : un rayon ne se range que sur la version courante.
 * Une purge passée pendant le calcul a monté la version ; le rayon, peut-être
 * calculé sur l'état d'avant, est refusé (« Un rayon calculé pendant une
 * écriture »). La version est GLOBALE, et doit le rester (§ 4).
 */
export function acceptsStore(currentVersion: number, offeredVersion: number): boolean {
  return offeredVersion === currentVersion;
}

/** Lit le corps d'un geste de l'interrupteur ; `null` = illisible (400). */
export function parseSwitchAction(body: unknown): ShelfSwitchAction | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const action: unknown = Reflect.get(body, "action");
  return SWITCH_ACTIONS.find((known) => known === action) ?? null;
}

/**
 * **L'état lu dans `meta`** : allumé par défaut. Une ligne absente — l'objet
 * tel que C2 l'a déployé, avant tout geste — vaut « allumé ».
 */
export function isEnabled(storedFlag: number | undefined): boolean {
  return storedFlag !== 0;
}

/**
 * **Le drapeau du rayon public, ÉTEINT par défaut** (C3) — l'inverse du pro,
 * et c'est voulu : tant que la clé de Workers Cache, le `Vary: Origin` du CORS
 * et la purge depuis le gestionnaire de sortie n'ont pas été vus en
 * production, aucune réponse publique ne se garde sans un geste.
 */
export function isPublicEnabled(storedFlag: number | undefined): boolean {
  return storedFlag === 1;
}

/**
 * **Ce que fait chaque geste.** Éteindre efface tout : un cache rallumé plus
 * tard ne doit rien servir de ce qui était rangé avant l'extinction — c'est
 * précisément ce qu'on éteint quand on le croit faux. La version monte avec
 * l'effacement, donc un rayon calculé avant l'extinction et présenté après le
 * rallumage est refusé. Rallumer ne range rien d'avance.
 */
export function switchPlan(action: ShelfSwitchAction): ShelfSwitchPlan {
  switch (action) {
    case "on":
      return { enabled: true, publicEnabled: null, eraseAll: false };
    case "off":
      // Éteindre éteint TOUT, public compris : c'est le geste du doute.
      return { enabled: false, publicEnabled: false, eraseAll: true };
    case "purge":
      return { enabled: null, publicEnabled: null, eraseAll: true };
    case "public-on":
      return { enabled: null, publicEnabled: true, eraseAll: false };
    case "public-off":
      return { enabled: null, publicEnabled: false, eraseAll: false };
  }
}

/** Éteint, l'objet ne garde rien ; allumé, le refus de version décide. */
export function storeDecision(
  enabled: boolean,
  currentVersion: number,
  offeredVersion: number,
): ShelfStoreDecision {
  if (!enabled) {
    return "not_kept";
  }
  return acceptsStore(currentVersion, offeredVersion) ? "stored" : "stale";
}

/** Éteint, toute lecture est un raté ; allumé, l'échéance décide. */
export function servesEntry(enabled: boolean, expiresAtMs: number, nowMs: number): boolean {
  return enabled && isFresh(expiresAtMs, nowMs);
}

/**
 * **« Une société et ses sites »** : les entrées de ces sociétés, et celles
 * dont l'une d'elles est le principal. Un niveau seulement — le plan n'a pas
 * vérifié qu'une société ne peut pas être principal ET site (§ 11).
 */
export function keysToErase(
  entries: readonly ShelfEntryMeta[],
  companyIds: readonly string[],
): readonly string[] {
  const erased = new Set(companyIds);
  return entries
    .filter((entry) => {
      const company = companyOfStorageKey(entry.key);
      return (
        (company !== null && erased.has(company)) ||
        (entry.principalId !== null && erased.has(entry.principalId))
      );
    })
    .map((entry) => entry.key);
}

function wholeNumber(raw: string | null): number | null {
  if (raw === null || !/^\d+$/u.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
