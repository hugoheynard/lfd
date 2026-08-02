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
 */
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
      return await fetch(new Request(target, request));
    } catch {
      // Upstream injoignable (down, en cours de build…) — on ne relaie pas le
      // détail interne, on rend un 502 clair (comme la sonde AppFrame côté shell).
      return new Response(`Gateway LFC : upstream injoignable pour « ${url.hostname} ».`, {
        status: 502,
      });
    }
  },
};
