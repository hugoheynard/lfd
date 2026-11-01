// Worker d'entrée de `lfd-route-planner` : le calcul d'itinéraires routiers de la
// Savoie, dans son propre conteneur (plan de tournée, lot 8, forme B-ter —
// documentation/livraisons/tournees/plan-preparation-de-tournee.md, L8-C10/C11).
//
// POURQUOI un Worker à part, et pas un second conteneur dans `lfd-api` : la
// carte se refait chaque mois, et elle doit pouvoir le faire sans repasser par
// tout le déploiement de l'API (B-bis n'avait qu'une vie). Deux Workers, deux
// déploiements, deux vies.
//
// POURQUOI aucune adresse publique : son seul appelant est la passerelle
// (`lfd-gateway`), par un service binding sous `/api/route-planner` — et c'est ELLE qui
// vérifie le jeton, avant tout routage (lot 8 bis, L8b-C1/C2). `lfd-api` passe
// par elle en HTTPS, comme n'importe quel appel sortant. La passerelle reste
// la seule porte d'entrée du compte ; une adresse ici en ferait une seconde,
// sans jeton (forme C, écartée).
//
// Les TUILES de la carte (lot 10 ter) passent aussi par ici, sous `/tiles`,
// mais ne touchent jamais le conteneur : le Worker les lit seul dans R2
// (`dispatch.ts`, `tiles.ts`).
//
// POURQUOI aucun cron : OSRM ne sert qu'au matin, à « Proposer ». Endormi, un
// conteneur ne coûte rien ; il se réveille au premier appel — et, depuis le
// 2026-11-01, dès l'ouverture du Tour manager, que `lfd-api` signale par un
// `/route` minimal (`OsrmRoadRoutingWaker`) : la carte se charge pendant qu'on
// lit l'écran.
import { Container } from "@cloudflare/containers";

import { dispatch } from "./dispatch";
import { TileMetadataMemo } from "./tile-cache";
import type { TileCache } from "./tile-cache";

interface Env {
  readonly OSRM: DurableObjectNamespace<Osrm>;
  /**
   * Le bucket `lfd-map-tiles` (lot 10 ter, L10t-C1), lu par liaison : aucune
   * clé d'accès, ce Worker est son seul lecteur.
   */
  readonly MAP_TILES: R2Bucket;
}

/** Le conteneur OSRM : `osrm-routed` sur le port 5000, graphe dans l'image. */
export class Osrm extends Container<Env> {
  defaultPort = 5000;
  // Délai d'INACTIVITÉ : une heure sans appel et l'instance s'endort
  // (2026-11-01, Hugo ; dix minutes avant). Une séance de composition entière
  // tient éveillée, pauses comprises : en dix minutes, l'instance se rendormait
  // entre deux « Proposer », et chaque réveil (copie de la carte, puis
  // chargement) faisait dire « le calcul routier ne répond pas ». Endormi, un
  // conteneur n'est pas facturé : l'heure de plus ne se paie qu'après usage.
  sleepAfter = "1h";
}

/**
 * L'instance unique, par un nom fixe : `max_instances: 1`, et un nom
 * déterministe route toujours vers le même conteneur, donc vers celui qui est
 * peut-être encore chaud. OSRM est sans état — rien n'est perdu à en changer.
 */
const INSTANCE = "savoie";

/**
 * La mémoire courte des tuiles (préfixe en service, en-têtes), au niveau du
 * module : elle vit autant que l'isolat, et sert toutes ses requêtes. Le temps
 * est celui du Worker (`Date.now()`, gelé pendant une entrée/sortie) : il ne
 * sert qu'à l'échéance de cette mémoire, jamais à un fait.
 */
const TILE_MEMO = new TileMetadataMemo(() => Date.now());

/** Le cache nommé des plages de tuiles, dans le cache de Cloudflare. */
const TILE_CACHE_NAME = "lfd-map-tiles";

/**
 * Le port {@link TileCache} sur l'API Cache de Cloudflare, par un cache NOMMÉ
 * (`caches.open`) : `caches.default` n'est pas typé ici, la bibliothèque
 * `WebWorker` du `tsconfig` masquant celle de Cloudflare — et les deux se
 * comportent pareil.
 */
const TILE_CACHE: TileCache = {
  match: async (key) => (await caches.open(TILE_CACHE_NAME)).match(key),
  put: async (key, response) => (await caches.open(TILE_CACHE_NAME)).put(key, response),
};

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return dispatch(request, {
      tiles: env.MAP_TILES,
      tileCaching: {
        cache: TILE_CACHE,
        memo: TILE_MEMO,
        defer: (work) => ctx.waitUntil(work),
      },
      container: () => env.OSRM.get(env.OSRM.idFromName(INSTANCE)),
    });
  },
} satisfies ExportedHandler<Env>;
