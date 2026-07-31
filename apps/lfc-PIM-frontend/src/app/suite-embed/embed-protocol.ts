/**
 * Contrat postMessage **shell ↔ app hostée** — copie côté app (PIM).
 *
 * ⚠️ SOURCE DE VÉRITÉ = `lfc-suite-shell/src/app/suite/embed-protocol.ts`. Garder
 * les deux en phase (à extraire dans `@lfd/suite-embed` au 2ᵉ consommateur).
 */

export const SUITE_CHANNEL = 'lfc-suite/v1';

/** app → shell : « je suis embarquée et prête ». */
export interface EmbedHelloMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'hello';
}
/** app → shell : la route interne a changé. */
export interface EmbedRouteMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'route';
  readonly path: string;
}
/** app → shell : demande d'un access token. */
export interface EmbedTokenRequest {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'token-request';
  readonly requestId: string;
  readonly audience: string;
}
export type EmbedMessage = EmbedHelloMessage | EmbedRouteMessage | EmbedTokenRequest;

/** shell → app : réponse token. */
export interface HostTokenMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'token';
  readonly requestId: string;
  readonly token: string | null;
}
/** shell → app : navigue (back/forward du parent). */
export interface HostNavigateMessage {
  readonly channel: typeof SUITE_CHANNEL;
  readonly kind: 'navigate';
  readonly path: string;
}
export type HostMessage = HostTokenMessage | HostNavigateMessage;

/** Garde : message venant du shell, conforme au protocole. */
export function isHostMessage(data: unknown): data is HostMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const m = data as { channel?: unknown; kind?: unknown };
  return m.channel === SUITE_CHANNEL && (m.kind === 'token' || m.kind === 'navigate');
}
