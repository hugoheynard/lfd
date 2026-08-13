import { DEV_PORTS, GATEWAY_SUBDOMAINS } from "@lfd/endpoints";

/**
 * Où va une requête — **la seule décision de la passerelle**, isolée ici pour
 * être testable sans le monde Workers.
 *
 * Deux modes, parce que dev et prod n'ont pas la même topologie :
 *
 * - **DEV, par sous-domaine.** `pim-back.localhost:8787` → `127.0.0.1:3100`.
 *   `*.localhost` résout en loopback sans toucher `/etc/hosts`, ce qui permet de
 *   simuler des sous-domaines sans en posséder.
 * - **PROD, par PRÉFIXE DE CHEMIN** vers un *service binding*. `/api/b2b/...`
 *   part chez le Worker du backend B2B **sans passer par le réseau public**.
 *
 * ## Pourquoi le chemin en prod, alors que le sous-domaine serait plus propre
 *
 * Router par sous-domaine suppose de POSSÉDER ces sous-domaines, donc une zone
 * Cloudflare, donc un domaine. Il n'y en a aucun sur le compte. Le préfixe de
 * chemin donne le même résultat fonctionnel sur la seule adresse dont on
 * dispose — celle de la passerelle elle-même — et se remplacera par des
 * sous-domaines le jour où un domaine existera, sans rien changer d'autre : les
 * backends, eux, ne verront jamais la différence (le préfixe est retiré avant
 * transmission).
 *
 * ## Pourquoi un binding et pas un `fetch()` public
 *
 * C'est TOUT l'intérêt de l'opération. Un `fetch("https://…workers.dev")`
 * ressortirait sur Internet et laisserait les backends publiquement joignables :
 * la passerelle serait contournable, donc décorative. Le binding est un appel
 * interne au compte — il permet d'éteindre ensuite `workers_dev` sur les
 * backends, qui n'auront alors **plus aucune adresse publique**.
 */

/** Le préfixe qui désigne un backend, retiré avant transmission. */
export const API_PREFIXES = {
  b2b: "/api/b2b",
  pim: "/api/pim",
} as const;

export type BackendKey = keyof typeof API_PREFIXES;

/** Table dev : sous-domaine `*.localhost` → serveur local. */
const local = (port: number): string => `http://127.0.0.1:${port}`;

export const DEV_ROUTES: Readonly<Record<string, string>> = {
  [`${GATEWAY_SUBDOMAINS.suiteShell}.localhost`]: local(DEV_PORTS.suiteShell),
  [`${GATEWAY_SUBDOMAINS.pimFront}.localhost`]: local(DEV_PORTS.pimFront),
  [`${GATEWAY_SUBDOMAINS.b2bFront}.localhost`]: local(DEV_PORTS.b2bFront),
  [`${GATEWAY_SUBDOMAINS.b2bAdminFront}.localhost`]: local(DEV_PORTS.b2bAdminFront),
  [`${GATEWAY_SUBDOMAINS.pimBack}.localhost`]: local(DEV_PORTS.pimBack),
  [`${GATEWAY_SUBDOMAINS.b2bBack}.localhost`]: local(DEV_PORTS.b2bBack),
};

/** Une destination résolue : soit une URL publique (dev), soit un backend interne. */
export type Target =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "backend"; readonly backend: BackendKey; readonly path: string };

/**
 * Résout la destination d'une requête. `undefined` ⇒ rien ne répond ici.
 *
 * L'ordre compte : le sous-domaine dev l'emporte, pour qu'un poste de dev garde
 * exactement le comportement d'aujourd'hui même si un chemin ressemble à un
 * préfixe d'API.
 */
export function resolveTarget(hostname: string, pathname: string): Target | undefined {
  const devUrl = DEV_ROUTES[hostname];
  if (devUrl !== undefined) {
    return { kind: "url", url: devUrl };
  }
  for (const [backend, prefix] of entriesOf(API_PREFIXES)) {
    const path = stripPrefix(pathname, prefix);
    if (path !== undefined) {
      return { kind: "backend", backend, path };
    }
  }
  return undefined;
}

/**
 * Retire le préfixe, ou rend `undefined` si le chemin ne lui appartient pas.
 *
 * `/api/b2bxyz` ne doit PAS matcher `/api/b2b` : on exige la fin de chaîne ou un
 * `/`. Sans cette garde, deux préfixes dont l'un est le début de l'autre se
 * voleraient des requêtes — le genre de bug qui n'apparaît qu'à l'ajout du
 * troisième backend.
 *
 * Le chemin rendu commence toujours par `/` : `/api/b2b` seul devient `/`, et
 * non la chaîne vide, qui produirait une URL invalide côté backend.
 */
function stripPrefix(pathname: string, prefix: string): string | undefined {
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const rest = pathname.slice(prefix.length);
  if (rest === "") {
    return "/";
  }
  return rest.startsWith("/") ? rest : undefined;
}

/** `Object.entries` typé sur une table constante (pas de `string` élargi). */
function entriesOf<T extends Record<string, string>>(table: T): [keyof T & string, string][] {
  return Object.entries(table);
}
