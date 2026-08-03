/**
 * Registre des ports & URLs **de développement** (localhost) de la suite LFC.
 *
 * Source de vérité UNIQUE : un port n'est écrit qu'ici. Tout le reste en dérive
 * — le shell (`suite-config.dev.ts`) et les CORS dev des backends PIM/B2B
 * l'importent au lieu de recopier le nombre. C'est la Phase 1 du plan
 * `documentation/architecture-suite-gateway-scaling.md` : tuer le drift où le
 * même port vivait dans 2–3 fichiers.
 *
 * Périmètre = **dev uniquement**. Les URLs de prod (Pages, domaines réels) vivent
 * dans `suite-config.ts` et, à terme, les vars de la passerelle — pas ici.
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
  /** Backend B2B (`lfc-B2B-platform-backend`). */
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
 * de NestJS `enableCors`. En prod, les origines viennent de l'environnement
 * (Phase 3), pas de ce registre.
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
