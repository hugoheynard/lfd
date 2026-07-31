/**
 * Contrat postMessage **shell ↔ app hostée** de la suite LFC — SOURCE DE VÉRITÉ.
 *
 * Le shell (host) et chaque app embarquée (embed : PIM, B2B admin, …) s'échangent
 * des messages via `postMessage` à travers la frontière iframe. Toute
 * communication passe par ces types ; les deux côtés **valident l'origine**
 * (jamais de `*` en réponse) via les gardes ci-dessous.
 *
 * Extrait en package partagé au **2ᵉ consommateur** (B2B admin) : avant, le
 * contrat était dupliqué shell ↔ PIM. Désormais une seule définition.
 */

/** Enveloppe commune : `channel` fige l'appartenance au protocole (anti-bruit). */
export const SUITE_CHANNEL = "lfc-suite/v1";

/** app → shell : « je suis embarquée et prête » (déclenche l'établissement). */
export interface EmbedHelloMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: "hello";
}

/** app → shell : la route interne a changé (pour refléter dans l'URL parent). */
export interface EmbedRouteMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: "route";
  /** Chemin interne de l'app, sans slash de tête (`produits`, `produits/42`). */
  readonly path: string;
}

/** app → shell : demande d'un access token pour un backend. */
export interface EmbedTokenRequest {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: "token-request";
  /** Corrèle la réponse. */
  readonly requestId: string;
  /** Audience du backend visé (clé côté shell). */
  readonly audience: string;
}

/** Tout message émis PAR une app embarquée. */
export type EmbedMessage = EmbedHelloMessage | EmbedRouteMessage | EmbedTokenRequest;

/** shell → app : réponse à une demande de token (succès ou échec, jamais le détail). */
export interface HostTokenMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: "token";
  readonly requestId: string;
  readonly token: string | null;
}

/** shell → app : navigue vers `path` (back/forward du parent, sans reload). */
export interface HostNavigateMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: "navigate";
  readonly path: string;
}

/** Tout message émis PAR le shell. */
export type HostMessage = HostTokenMessage | HostNavigateMessage;

/** Vrai si `data` porte l'enveloppe du protocole (objet avec `channel`+`kind`). */
function isEnvelope(data: unknown): data is { channel: unknown; kind: unknown } {
  return typeof data === "object" && data !== null && "channel" in data && "kind" in data;
}

/**
 * Garde côté **shell** : un message conforme émis par une app embarquée. Rejette
 * tout bruit avant traitement.
 */
export function isEmbedMessage(data: unknown): data is EmbedMessage {
  if (!isEnvelope(data)) {
    return false;
  }
  return (
    data.channel === SUITE_CHANNEL &&
    (data.kind === "hello" || data.kind === "route" || data.kind === "token-request")
  );
}

/**
 * Garde côté **app** : un message conforme émis par le shell. Rejette tout bruit
 * avant traitement.
 */
export function isHostMessage(data: unknown): data is HostMessage {
  if (!isEnvelope(data)) {
    return false;
  }
  return data.channel === SUITE_CHANNEL && (data.kind === "token" || data.kind === "navigate");
}
