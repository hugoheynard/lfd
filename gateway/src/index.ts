import { PRO_FRONT_ORIGIN, resolveTarget } from "./routes";
import type { BackendKey, Target } from "./routes";
import { formatTrafficPoint, trafficPoint } from "./traffic";
import type { TrafficObservation } from "./traffic";

/**
 * Passerelle de la suite LFC. **Zéro métier** — du routage, rien d'autre.
 * Délibérément trivial : elle prend tout le trafic, donc elle doit rester simple
 * (cf. documentation/architecture-suite-gateway-scaling.md, AD-1). Toutes les
 * décisions de routage vivent dans `routes.ts`, sous tests ; ici il ne reste que
 * l'exécution.
 *
 * Deux façons d'atteindre un upstream, et la différence est structurante :
 *   - **URL publique** (`fetch`) — les serveurs de dev, en local ;
 *   - **service binding** (`env.LFD_BACKEND.fetch`) — les backends en prod, par
 *     un appel INTERNE au compte. C'est ce qui permettra d'éteindre
 *     `workers_dev` sur les backends : sans adresse publique, la gateway
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
  LFD_BACKEND?: Fetcher;
  /**
   * Le dataset Analytics Engine (`TRAFFIC_DATASET` dans `traffic.ts`). Optionnel comme
   * les bindings : absent en `wrangler dev`, et son absence ne doit jamais
   * empêcher une requête de passer — OPS observe, il n'arbitre rien.
   */
  TRAFFIC?: AnalyticsEngineDataset;
}

/** Une requête traitée : ce qu'on rend, et ce qu'on en retient pour OPS. */
interface Handled {
  readonly response: Response;
  readonly observation: Omit<TrafficObservation, "durationMs">;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startedAt = Date.now();
    const handled = await handle(request, new URL(request.url), env);
    observe(env, { ...handled.observation, durationMs: Date.now() - startedAt });
    return handled.response;
  },
};

/**
 * Le routage proprement dit. Chaque sortie dit **qui** a fabriqué la réponse :
 * un `5xx` venu de l'upstream signifie que le backend a répondu en échouant, un
 * `502` de la gateway qu'il n'a pas répondu du tout. OPS ne peut conclure à
 * un nœud mort que sur le second.
 */
async function handle(request: Request, url: URL, env: Env): Promise<Handled> {
  const target = resolveTarget(url.hostname, url.pathname);
  if (target === undefined) {
    return gatewayFault(404, `rien ne répond sur « ${url.pathname} »`, "unrouted", url.pathname);
  }
  const node = nodeOf(target);
  const forwardedPath = target.kind === "url" ? url.pathname : target.path;
  const destination = destinationFor(target, url, env);
  if (destination === undefined) {
    // Binding déclaré nulle part : c'est une ERREUR DE CONFIGURATION, pas un
    // incident réseau. On le dit en 503 plutôt que de retomber sur un appel
    // public — ce serait rouvrir en silence la porte qu'on veut fermer.
    return gatewayFault(503, `nœud non relié « ${url.pathname} »`, node, forwardedPath);
  }
  try {
    const forward = withTraceContext(
      withClientIp(new Request(destination.url, request), request),
      request,
    );
    const response = await destination.send(forward);
    return {
      response,
      observation: { node, status: response.status, forwardedPath, origin: "upstream" },
    };
  } catch {
    // Upstream injoignable (down, en cours de build…) — on ne relaie pas le
    // détail interne, on rend un 502 clair (comme la sonde AppFrame côté shell).
    return gatewayFault(502, `upstream injoignable pour « ${url.pathname} »`, node, forwardedPath);
  }
}

/** Une réponse fabriquée par la gateway elle-même — jamais par un backend. */
function gatewayFault(
  status: number,
  reason: string,
  node: TrafficObservation["node"],
  forwardedPath: string,
): Handled {
  return {
    response: new Response(`Gateway LFC : ${reason}.`, { status }),
    observation: { node, status, forwardedPath, origin: "gateway" },
  };
}

/**
 * Dépose le point Analytics Engine. `writeDataPoint` ne rend pas de promesse et
 * n'attend rien : l'écriture n'allonge pas la réponse.
 *
 * **Sans binding, on journalise au lieu d'écrire.** Deux situations, et la même
 * réponse convient aux deux :
 *
 *   - en `wrangler dev`, il n'y a ni dataset ni API SQL — la ligne journalisée
 *     est la seule façon de vérifier le J1 avant un déploiement, et d'écrire la
 *     suite sur un format qu'on a vu plutôt que deviné ;
 *   - en production, un binding absent est une **erreur de configuration**, et
 *     on la veut bruyante : muette, elle se traduirait par une carte de santé
 *     vide qu'on croirait calme.
 *
 * Dans aucun cas on ne jette : une observation impossible ne doit jamais faire
 * échouer le trafic observé.
 */
function observe(env: Env, observation: TrafficObservation): void {
  const point = trafficPoint(observation);
  if (env.TRAFFIC === undefined) {
    console.log(formatTrafficPoint(point));
    return;
  }
  // Recopie en tableaux mutables : notre contrat est `readonly` (règle du dépôt),
  // la signature Cloudflare ne l'est pas. On adapte à la frontière, sans `as`.
  env.TRAFFIC.writeDataPoint({
    indexes: [...point.indexes],
    blobs: [...point.blobs],
    doubles: [...point.doubles],
  });
}

/** Où envoyer, et par quel moyen. `undefined` ⇒ binding manquant. */
interface Destination {
  readonly url: string;
  readonly send: (request: Request) => Promise<Response>;
}

/** Le nœud qu'OPS retiendra — le déployable visé, pas la surface demandée. */
function nodeOf(target: Target): TrafficObservation["node"] {
  switch (target.kind) {
    case "backend":
      return target.backend;
    case "front":
      return target.front;
    default:
      return "dev";
  }
}

function destinationFor(target: Target, url: URL, env: Env): Destination | undefined {
  if (target.kind === "url") {
    return { url: new URL(url.pathname + url.search, target.url).toString(), send: fetch };
  }
  if (target.kind === "front") {
    // Le préfixe est DÉJÀ retiré : Pages sert depuis sa racine, et c'est
    // l'app qui porte `/pro` dans son `base href`. Les deux moitiés doivent
    // rester d'accord — l'une sans l'autre, ce sont des 404 sur tous les assets.
    return { url: new URL(target.path + url.search, PRO_FRONT_ORIGIN).toString(), send: fetch };
  }
  const binding = bindingFor(target.backend, env);
  if (binding === undefined) {
    return undefined;
  }
  // L'origine est arbitraire — un binding ne résout aucun DNS — mais `Request`
  // exige une URL absolue. On garde celle de la gateway, ce qui rend les
  // journaux du backend lisibles.
  return {
    url: new URL(target.path + url.search, url.origin).toString(),
    send: (forward) => binding.fetch(forward),
  };
}

/**
 * Le binding d'un backend. Un seul aujourd'hui — mais la fonction reste, et
 * reste typée sur `BackendKey` : c'est le compilateur qui réclamera le cas
 * manquant le jour où un deuxième backend rejoint `API_PREFIXES`.
 */
function bindingFor(backend: BackendKey, env: Env): Fetcher | undefined {
  switch (backend) {
    case "lfd":
      return env.LFD_BACKEND;
  }
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
