/** Ce que le transport rend d'un appel : la réponse, ou pourquoi il n'y en a pas. */
export type TransportOutcome =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly serverTiming: string | null;
      readonly shelfCache: string | null;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "unreachable" };

/**
 * Port du transport des mesures : un `GET` vers la passerelle, avec les
 * en-têtes donnés et un délai borné. Il ne lève pas : un échec réseau est
 * une mesure comme une autre.
 */
export abstract class RouteTimingTransport {
  abstract get(
    url: string,
    headers: Readonly<Record<string, string>>,
    timeoutMs: number,
  ): Promise<TransportOutcome>;
}
