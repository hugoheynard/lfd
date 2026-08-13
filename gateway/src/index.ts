import { resolveTarget } from "./routes";
import type { BackendKey, Target } from "./routes";

/**
 * Passerelle de la suite LFC. **Zéro métier** — du routage, rien d'autre.
 * Délibérément trivial : elle prend tout le trafic, donc elle doit rester simple
 * (cf. documentation/architecture-suite-gateway-scaling.md, AD-1). Toutes les
 * décisions de routage vivent dans `routes.ts`, sous tests ; ici il ne reste que
 * l'exécution.
 *
 * Deux façons d'atteindre un upstream, et la différence est structurante :
 *   - **URL publique** (`fetch`) — les serveurs de dev, en local ;
 *   - **service binding** (`env.B2B_BACKEND.fetch`) — les backends en prod, par
 *     un appel INTERNE au compte. C'est ce qui permettra d'éteindre
 *     `workers_dev` sur les backends : sans adresse publique, la passerelle
 *     devient le seul chemin, donc une vraie frontière et non une décoration.
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

/** Les backends joignables par service binding. Absents en `wrangler dev`. */
interface Env {
  B2B_BACKEND?: Fetcher;
  PIM_BACKEND?: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const target = resolveTarget(url.hostname, url.pathname);
    if (target === undefined) {
      return new Response(`Gateway LFC : rien ne répond sur « ${url.pathname} ».`, {
        status: 404,
      });
    }
    const destination = destinationFor(target, url, env);
    if (destination === undefined) {
      // Binding déclaré nulle part : c'est une ERREUR DE CONFIGURATION, pas un
      // incident réseau. On le dit en 503 plutôt que de retomber sur un appel
      // public — ce serait rouvrir en silence la porte qu'on veut fermer.
      return new Response(`Gateway LFC : backend non relié « ${url.pathname} ».`, {
        status: 503,
      });
    }
    try {
      const forward = withTraceContext(
        withClientIp(new Request(destination.url, request), request),
        request,
      );
      return await destination.send(forward);
    } catch {
      // Upstream injoignable (down, en cours de build…) — on ne relaie pas le
      // détail interne, on rend un 502 clair (comme la sonde AppFrame côté shell).
      return new Response(`Gateway LFC : upstream injoignable pour « ${url.pathname} ».`, {
        status: 502,
      });
    }
  },
};

/** Où envoyer, et par quel moyen. `undefined` ⇒ binding manquant. */
interface Destination {
  readonly url: string;
  readonly send: (request: Request) => Promise<Response>;
}

function destinationFor(target: Target, url: URL, env: Env): Destination | undefined {
  if (target.kind === "url") {
    return { url: new URL(url.pathname + url.search, target.url).toString(), send: fetch };
  }
  const binding = bindingFor(target.backend, env);
  if (binding === undefined) {
    return undefined;
  }
  // L'origine est arbitraire — un binding ne résout aucun DNS — mais `Request`
  // exige une URL absolue. On garde celle de la passerelle, ce qui rend les
  // journaux du backend lisibles.
  return {
    url: new URL(target.path + url.search, url.origin).toString(),
    send: (forward) => binding.fetch(forward),
  };
}

function bindingFor(backend: BackendKey, env: Env): Fetcher | undefined {
  return backend === "b2b" ? env.B2B_BACKEND : env.PIM_BACKEND;
}

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
