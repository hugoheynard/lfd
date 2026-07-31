/**
 * Contrat postMessage **shell ↔ app hostée** (SOURCE DE VÉRITÉ).
 *
 * Le shell (host) et chaque app embarquée (embed) s'échangent des messages via
 * `postMessage` à travers la frontière iframe. Toute communication passe par ces
 * types ; les deux côtés **valident l'origine** (jamais de `*` en réponse).
 *
 * ⚠️ Ce fichier est dupliqué côté app (PIM : `suite-embed/embed-protocol.ts`).
 * Garder les deux en phase — à extraire dans `@lfd/suite-embed` au 2ᵉ consommateur.
 */

/** Enveloppe commune : `channel` fige l'appartenance au protocole (anti-bruit). */
export const SUITE_CHANNEL = 'lfc-suite/v1';

/** app → shell : « je suis embarquée et prête » (déclenche l'établissement). */
export interface EmbedHelloMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'hello';
}

/** app → shell : la route interne a changé (pour refléter dans l'URL parent). */
export interface EmbedRouteMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'route';
  /** Chemin interne de l'app, sans slash de tête (`produits`, `produits/42`). */
  readonly path: string;
}

/** app → shell : demande d'un access token pour un backend. */
export interface EmbedTokenRequest {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'token-request';
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
  readonly kind: 'token';
  readonly requestId: string;
  readonly token: string | null;
}

/** shell → app : navigue vers `path` (back/forward du parent, sans reload). */
export interface HostNavigateMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'navigate';
  readonly path: string;
}

/** Tout message émis PAR le shell. */
export type HostMessage = HostTokenMessage | HostNavigateMessage;

/** Garde de type : un message inconnu/bruyant est rejeté avant tout traitement. */
export function isEmbedMessage(data: unknown): data is EmbedMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const m = data as { channel?: unknown; kind?: unknown };
  return (
    m.channel === SUITE_CHANNEL &&
    (m.kind === 'hello' || m.kind === 'route' || m.kind === 'token-request')
  );
}
