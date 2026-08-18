/**
 * Registre des ports & URLs **de développement** (localhost) de la suite LFC.
 *
 * Source de vérité UNIQUE : un port n'est écrit qu'ici. Tout le reste en dérive
 * — le shell (`suite-config.dev.ts`) et les CORS dev des backends PIM/B2B
 * l'importent au lieu de recopier le nombre. C'est la Phase 1 du plan
 * `documentation/architecture-suite-gateway-scaling.md` : tuer le drift où le
 * même port vivait dans 2–3 fichiers.
 *
 * Périmètre = ports & topologie **dev** (le gros du fichier) **+** les origines
 * **prod** des fronts, seules valeurs prod stables et publiques dont un backend a
 * besoin au runtime (allowlist CORS). Le reste de la prod (API base du front,
 * Auth0) reste injecté au build via `generate-auth-config.mjs` — pas ici.
 *
 * ⚠️ Les ports de serve dans les `angular.json` (JSON, non importable) doivent
 * rester alignés sur `DEV_PORTS` : shell→7300, pimFront→7315, b2bFront→7316,
 * b2bAdminFront→7317.
 */

/** Bloc de ports alloué en dev. Le seul endroit où ces nombres sont écrits. */
export const DEV_PORTS = {
  /** Shell hôte de la suite (`lfc-suite-shell`). */
  suiteShell: 7300,
  /** Front PIM (`lfc-PIM-frontend`). */
  pimFront: 7315,
  /** Front B2B (`lfc-B2B-platform-frontend`). */
  b2bFront: 7316,
  /** Front B2B admin (`lfc-B2B-admin-frontend`). */
  b2bAdminFront: 7317,
  /** Backend PIM (`lfc-PIM-backend`). */
  pimBack: 3100,
  /** Backend B2B (`lfd-api`). */
  b2bBack: 3200,
  /** Port Angular par défaut, gardé pour un éventuel 2ᵉ front local. */
  spareFront: 4200,
} as const;

const localhost = (port: number): string => `http://localhost:${port}`;

/**
 * Les **deux** noms du loopback pour un port. Le dev-server Angular bind
 * `127.0.0.1` (cf. le piège host IPv6), mais un navigateur atteint la page en
 * `localhost` comme en `127.0.0.1`, et l'`Origin` qu'il envoie suit exactement
 * l'URL tapée. Les deux doivent donc passer le CORS, sinon ouvrir la page en
 * `127.0.0.1:PORT` fait échouer tous les appels API (« serveur injoignable »).
 */
const loopbacks = (port: number): string[] => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
];

/** URLs dev (localhost) des fronts ET des backends, dérivées de `DEV_PORTS`. */
export const DEV_URLS = {
  suiteShell: localhost(DEV_PORTS.suiteShell),
  pimFront: localhost(DEV_PORTS.pimFront),
  b2bFront: localhost(DEV_PORTS.b2bFront),
  b2bAdminFront: localhost(DEV_PORTS.b2bAdminFront),
  pimBack: localhost(DEV_PORTS.pimBack),
  b2bBack: localhost(DEV_PORTS.b2bBack),
} as const;

/**
 * Passerelle dev (`lfc-suite-gateway`, `wrangler dev`) : UN worker route par
 * sous-domaine `*.localhost:PORT` vers les serveurs locaux, pour **simuler la
 * prod B** (sous-domaines) en dev. `*.localhost` résout en loopback sans
 * `/etc/hosts`. Le gateway ET les fronts (détection à l'exécution) dérivent de
 * cette même topologie — source unique, pas de drift.
 */
export const DEV_GATEWAY_PORT = 8787;

/** app → sous-domaine de la passerelle. Le worker `gateway/src/routes.ts` en dérive. */
export const GATEWAY_SUBDOMAINS = {
  suiteShell: "suite",
  pimFront: "pim",
  b2bFront: "b2b",
  b2bAdminFront: "b2b-admin",
  pimBack: "api-pim",
  b2bBack: "api-b2b",
} as const;

const gatewayUrl = (subdomain: string): string =>
  `http://${subdomain}.localhost:${DEV_GATEWAY_PORT}`;

/** URLs des apps **via la passerelle** (sous-domaines `*.localhost:8787`). */
export const GATEWAY_URLS = {
  suiteShell: gatewayUrl(GATEWAY_SUBDOMAINS.suiteShell),
  pimFront: gatewayUrl(GATEWAY_SUBDOMAINS.pimFront),
  b2bFront: gatewayUrl(GATEWAY_SUBDOMAINS.b2bFront),
  b2bAdminFront: gatewayUrl(GATEWAY_SUBDOMAINS.b2bAdminFront),
  pimBack: gatewayUrl(GATEWAY_SUBDOMAINS.pimBack),
  b2bBack: gatewayUrl(GATEWAY_SUBDOMAINS.b2bBack),
} as const;

/**
 * Vrai si l'origine courante est servie **via la passerelle** (hostname en
 * `*.localhost`). Le direct dev (`localhost` / `127.0.0.1`) rend `false`. Sert
 * aux fronts à choisir entre `DEV_URLS` (direct) et `GATEWAY_URLS` (passerelle).
 */
export function isViaGateway(hostname: string): boolean {
  return hostname.endsWith(".localhost");
}

/**
 * Origines CORS autorisées **en dev** pour chaque backend : son front + le port
 * spare. Type `string[]` (mutable) pour rester assignable à l'option `origin`
 * de NestJS `enableCors`. Les origines **prod** sont dans `PROD_CORS_ORIGINS` ;
 * le backend choisit l'un ou l'autre selon `NODE_ENV`.
 */
export const DEV_CORS_ORIGINS: Readonly<Record<"pim" | "b2b", string[]>> = {
  // Direct (localhost:PORT **et** 127.0.0.1:PORT — le dev-server bind 127.0.0.1)
  // ET via la passerelle (*.localhost:8787) : le front peut appeler l'API de
  // toutes ces façons selon comment il a été ouvert.
  pim: [
    ...loopbacks(DEV_PORTS.pimFront),
    GATEWAY_URLS.pimFront,
    ...loopbacks(DEV_PORTS.spareFront),
  ],
  // Le backend B2B sert DEUX fronts : la boutique cliente ET l'app admin staff
  // (Invariant C) — en direct et via la passerelle.
  b2b: [
    ...loopbacks(DEV_PORTS.b2bFront),
    ...loopbacks(DEV_PORTS.b2bAdminFront),
    GATEWAY_URLS.b2bFront,
    GATEWAY_URLS.b2bAdminFront,
    ...loopbacks(DEV_PORTS.spareFront),
  ],
};

/**
 * Origines des fronts en **PRODUCTION** (Cloudflare Pages, alias de prod stable).
 * Publiques et fixes → vivent ici, à côté des dev, plutôt que dans une variable
 * d'environnement : une seule source de vérité, zéro câblage CI pour le CORS.
 *
 * Noms de projet Pages (cf. `.github/workflows/deploy_*_frontend*.yml`) :
 * `lfc-b2b` (boutique), `lfc-b2b-admin` (staff), `lfc-pim`. Quand un domaine
 * custom est branché (ex. `b2b.lafoliedouce.eu`), l'AJOUTER ici — le navigateur
 * envoie l'`Origin` du domaine réellement visité.
 */
export const PROD_FRONT_ORIGINS = {
  // ⚠️ `lfc-b2b-eu7`, PAS `lfc-b2b` : Cloudflare a suffixé le sous-domaine du
  // projet Pages (le nom court était déjà pris). Vérifié le 2026-08-13 par
  // l'API Cloudflare, puis en comparant les bundles servis — `lfc-b2b.pages.dev`
  // rend une build DIFFÉRENTE et plus ancienne, qu'aucun de nos déploiements
  // ne met à jour.
  //
  // La conséquence était une panne complète et silencieuse : la boutique
  // déployée émettait ses appels depuis `lfc-b2b-eu7…`, origine absente de la
  // liste ci-dessous, donc refusée par le CORS. Mesuré : préflight sans aucun
  // en-tête `access-control-allow-origin`. Personne ne l'avait vu parce que
  // personne ne s'était encore connecté à la boutique cliente.
  b2bFront: "https://lfc-b2b-eu7.pages.dev",
  b2bAdminFront: "https://lfc-b2b-admin.pages.dev",
  pimFront: "https://lfc-pim.pages.dev",
} as const;

/**
 * Origines CORS autorisées **en prod** par backend. Le B2B sert DEUX fronts
 * (boutique cliente + admin staff, Invariant C) ; le PIM un seul. Liste **fermée**
 * → un site tiers reste refusé.
 */
/**
 * Ancienne adresse de la boutique, servie par un déploiement que nos workflows
 * ne mettent plus à jour (probablement l'autre compte Cloudflare, celui qui
 * hébergeait aussi l'ancienne base). Gardée le temps que les liens déjà
 * distribués cessent d'être suivis.
 *
 * ⚠️ À RETIRER. Autoriser en CORS une origine dont on ne maîtrise plus le
 * contenu déployé, c'est faire confiance à du code qu'on ne relit plus.
 */
const LEGACY_B2B_FRONT = "https://lfc-b2b.pages.dev";

export const PROD_CORS_ORIGINS: Readonly<Record<"pim" | "b2b", string[]>> = {
  pim: [PROD_FRONT_ORIGINS.pimFront],
  b2b: [PROD_FRONT_ORIGINS.b2bFront, PROD_FRONT_ORIGINS.b2bAdminFront, LEGACY_B2B_FRONT],
};

/**
 * Message **affichable** tiré d'une erreur HTTP (front), sûr **par
 * construction** : on ne lit que le `message` de l'enveloppe d'API — déjà filtré
 * côté backend (une erreur technique y est neutre, cf. `AppErrorFilter`) — jamais
 * un détail interne. `status: 0` = requête qui n'a pas atteint le serveur
 * (réseau/CORS). À défaut, un repli générique. Typé `unknown` + narrowing (pas
 * d'`as`) pour rester agnostique d'Angular (`HttpErrorResponse` structurel).
 */
export function httpErrorMessage(error: unknown, fallback = "Une erreur est survenue."): string {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }
  if ("status" in error && error.status === 0) {
    return "Serveur injoignable. Vérifiez votre connexion et réessayez.";
  }
  if ("error" in error) {
    const body = error.error;
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = body.message;
      if (typeof message === "string" && message.trim() !== "") {
        return message;
      }
    }
  }
  return fallback;
}
