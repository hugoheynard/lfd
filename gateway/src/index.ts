import { routeFor } from "./routes";

/**
 * Passerelle de la suite LFC. **Zéro métier** — routage pur par `Host` vers
 * l'upstream (fronts Pages / backends Containers en prod ; serveurs dev locaux
 * en dev). C'est le point d'entrée unique de la zone (modèle B), délibérément
 * trivial : il prend tout le trafic, donc il doit rester simple (cf.
 * documentation/architecture-suite-gateway-scaling.md, AD-1).
 *
 * Il **forwarde tout** — méthode, corps, en-têtes (`Authorization` compris) et
 * l'upgrade WebSocket (HMR Vite en dev). Le `Host` envoyé à l'upstream est
 * réécrit par `fetch` sur l'origine cible (en-tête interdit), donc les dev-servers
 * voient bien leur propre hôte.
 *
 * **IP cliente** : la gateway est le seul maillon qui voit l'IP réelle et
 * infalsifiable (`cf-connecting-ip`, posé par Cloudflare à l'entrée). Cet en-tête
 * n'est pas garanti de survivre au saut vers le worker backend, donc on le
 * recopie explicitement dans `x-lfc-client-ip` — que les workers backend et le
 * throttler applicatif lisent en priorité pour rate-limiter par vrai client
 * (cf. `X_LFC_CLIENT_IP`). On **écrase** systématiquement (ou on supprime) toute
 * valeur envoyée par le client : impossible d'usurper une IP en la posant soi-même.
 *
 * **Traçabilité** : la gateway est aussi l'origine de la trace. Elle propage le
 * `traceparent` W3C entrant s'il est conforme (trace distribuée continuée),
 * sinon elle en génère un — le backend en dérive son `traceId` (logs, journal,
 * `requestId` d'erreur). Elle estampe `x-lfc-request-time` (instant d'ingress) à
 * usage **observabilité/latence uniquement** — le backend ne s'en sert JAMAIS
 * comme temps métier (celui-là vient du `Clock` backend : pas de dérive/spoof).
 */
const X_LFC_CLIENT_IP = "x-lfc-client-ip";
const TRACEPARENT = "traceparent";
const X_LFC_REQUEST_TIME = "x-lfc-request-time";
const TRACEPARENT_FORMAT = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upstream = routeFor(url.hostname);
    if (upstream === undefined) {
      return new Response(`Gateway LFC : hôte non routé « ${url.hostname} ».`, {
        status: 404,
      });
    }
    const target = new URL(url.pathname + url.search, upstream);
    try {
      const forward = withTraceContext(
        withClientIp(new Request(target, request), request),
        request,
      );
      return await fetch(forward);
    } catch {
      // Upstream injoignable (down, en cours de build…) — on ne relaie pas le
      // détail interne, on rend un 502 clair (comme la sonde AppFrame côté shell).
      return new Response(`Gateway LFC : upstream injoignable pour « ${url.hostname} ».`, {
        status: 502,
      });
    }
  },
};

/**
 * Recopie l'IP client réelle dans `x-lfc-client-ip` avant de forwarder. Écrase
 * toujours (present → set, absent → delete) : une valeur posée par le client ne
 * doit jamais franchir la gateway, sinon le rate-limit serait contournable.
 */
function withClientIp(forward: Request, original: Request): Request {
  const clientIp = original.headers.get("cf-connecting-ip");
  if (clientIp !== null && clientIp !== "") {
    forward.headers.set(X_LFC_CLIENT_IP, clientIp);
  } else {
    forward.headers.delete(X_LFC_CLIENT_IP);
  }
  return forward;
}

/**
 * Propage la trace W3C et l'instant d'ingress. `traceparent` entrant conforme →
 * conservé (trace distribuée continuée) ; sinon on en génère un neuf.
 * `x-lfc-request-time` est **toujours écrasé** (observabilité, pas du métier).
 */
function withTraceContext(forward: Request, original: Request): Request {
  const incoming = original.headers.get(TRACEPARENT);
  if (incoming === null || !TRACEPARENT_FORMAT.test(incoming.trim().toLowerCase())) {
    forward.headers.set(TRACEPARENT, newTraceparent());
  }
  forward.headers.set(X_LFC_REQUEST_TIME, Date.now().toString());
  return forward;
}

/** Un `traceparent` W3C neuf : `00-<traceId 16o>-<spanId 8o>-01` (échantillonné). */
function newTraceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

/** `bytes` octets aléatoires en hexadécimal (CSPRNG de la plateforme Workers). */
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
