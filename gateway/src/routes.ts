import { DEV_PORTS, GATEWAY_SUBDOMAINS, PROD_FRONT_ORIGINS } from "@lfd/endpoints";

/**
 * Où va une requête — **la seule décision de la gateway**, isolée ici pour
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
 * dispose — celle de la gateway elle-même — et se remplacera par des
 * sous-domaines le jour où un domaine existera, sans rien changer d'autre : les
 * backends, eux, ne verront jamais la différence (le préfixe est retiré avant
 * transmission).
 *
 * ## Pourquoi un binding et pas un `fetch()` public
 *
 * C'est TOUT l'intérêt de l'opération. Un `fetch("https://…workers.dev")`
 * ressortirait sur Internet et laisserait les backends publiquement joignables :
 * la gateway serait contournable, donc décorative. Le binding est un appel
 * interne au compte — il permet d'éteindre ensuite `workers_dev` sur les
 * backends, qui n'auront alors **plus aucune adresse publique**.
 */

/**
 * Le préfixe qui désigne un backend, retiré avant transmission.
 *
 * Il nomme le **DÉPLOYABLE**, pas une de ses surfaces. C'était `/api/b2b`, ce
 * qui désignait un domaine métier sur les quatre que `lfd-api` sert — b2b, pim,
 * ops, staff — et laissait croire qu'il existait ailleurs une autre API pour le
 * reste. La boutique ET le back-office passent par celui-ci.
 *
 * **Un seul**, depuis que le référentiel est un module du back-office (B6) :
 * son backend a fondu dans celui-ci (B2c) et `/api/pim` ne menait plus qu'à un
 * Worker que personne n'appelait. La table reste une TABLE, et non une
 * constante : c'est elle qui rend l'ajout du deuxième backend mécanique, et
 * `stripPrefix` garde sa garde de frontière pour ce jour-là.
 */
export const API_PREFIXES = {
  lfd: "/api/lfd",
} as const;

export type BackendKey = keyof typeof API_PREFIXES;

/**
 * Le préfixe qui désigne un FRONT servi par la zone, retiré avant transmission.
 *
 * `lafoliecoffee.info/pro` est un CHEMIN, pas un sous-domaine — c'est ce qui a
 * été demandé, et la nuance a un coût : un sous-domaine se règle par un domaine
 * personnalisé sur le projet Pages, sans une ligne de code ; un chemin oblige la
 * passerelle à le porter, et l'app à connaître son préfixe (`base href`).
 *
 * ⚠️ Contrairement aux backends, la destination est un `fetch()` PUBLIC et non
 * un *service binding* : un projet Pages ne peut pas être la cible d'un binding.
 * L'argument de non-contournement ne s'applique pas ici — un front statique est
 * public par nature, et son adresse `pages.dev` le restera de toute façon.
 */

/**
 * L'origine du front client — **la même constante que le CORS**, et pas une
 * variable de la passerelle.
 *
 * Ce n'est pas une économie de câblage, c'est une immunité. Le nom du projet
 * Pages est `lfc-b2b`, mais Cloudflare a suffixé son sous-domaine en silence :
 * l'adresse servie est `lfc-b2b-eu7.pages.dev`, et `lfc-b2b.pages.dev` rend une
 * build PLUS ANCIENNE qu'aucun déploiement ne met à jour. Vérifié le
 * 2026-08-27 : les deux répondent 200 avec des bundles différents. Le dépôt
 * avait déjà payé ce piège une fois — une panne CORS complète et silencieuse —
 * et deux endroits qui écrivent l'adresse à la main le paieraient une deuxième.
 */
export const PRO_FRONT_ORIGIN = PROD_FRONT_ORIGINS.b2bFront;

/**
 * Les seuls en-têtes qu'on transmet à l'hébergeur du front.
 *
 * ⚠️ Ce n'est PAS de l'hygiène, c'est ce qui empêche la boucle. Recopier la
 * requête entrante recopie son `Host` — celui de la zone — et le sous-appel
 * repart alors vers la zone, donc vers cette passerelle, indéfiniment. Le
 * runtime coupe, `fetch` lève, et on rend un 502 qui accuse l'upstream d'être
 * injoignable alors qu'il n'a jamais été appelé. Constaté en production le
 * 2026-08-27, à la première requête sur `/pro`.
 *
 * Les backends n'ont pas ce problème : ils passent par un *service binding*, qui
 * ne résout aucun DNS. Le front est le premier `fetch()` public de la
 * passerelle, et donc le premier à pouvoir se mordre la queue.
 *
 * Un hébergeur de fichiers statiques n'a de toute façon besoin de rien d'autre :
 * ni trace, ni IP client, ni cookie.
 */
export const FRONT_FORWARDED_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "user-agent",
  "if-none-match",
  "if-modified-since",
  "range",
] as const;

/** Ne garde de `headers` que ce qu'un hébergeur de fichiers statiques sait lire. */
export function frontHeaders(headers: Headers): Headers {
  const kept = new Headers();
  for (const name of FRONT_FORWARDED_HEADERS) {
    const value = headers.get(name);
    if (value !== null && value !== "") {
      kept.set(name, value);
    }
  }
  return kept;
}
export const FRONT_PREFIXES = {
  pro: "/pro",
} as const;

export type FrontKey = keyof typeof FRONT_PREFIXES;

/** Table dev : sous-domaine `*.localhost` → serveur local. */
const local = (port: number): string => `http://127.0.0.1:${port}`;

const DEV_ROUTES: Readonly<Record<string, string>> = {
  [`${GATEWAY_SUBDOMAINS.b2bFront}.localhost`]: local(DEV_PORTS.b2bFront),
  [`${GATEWAY_SUBDOMAINS.b2bAdminFront}.localhost`]: local(DEV_PORTS.b2bAdminFront),
  [`${GATEWAY_SUBDOMAINS.b2bBack}.localhost`]: local(DEV_PORTS.b2bBack),
};

/** Une destination résolue : soit une URL publique (dev), soit un backend interne. */
export type Target =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "backend"; readonly backend: BackendKey; readonly path: string }
  | { readonly kind: "front"; readonly front: FrontKey; readonly path: string };

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
  // Les fronts APRÈS les API : un préfixe d'API ne doit jamais pouvoir être
  // capté par un front, quelle que soit l'ordre d'écriture des deux tables.
  for (const [front, prefix] of entriesOf(FRONT_PREFIXES)) {
    const path = stripPrefix(pathname, prefix);
    if (path !== undefined) {
      return { kind: "front", front, path };
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
 * DEUXIÈME backend, et qu'on ne veut pas redécouvrir ce jour-là.
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
