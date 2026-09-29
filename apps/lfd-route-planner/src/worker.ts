// Worker d'entrée de `lfd-route-planner` : le calcul d'itinéraires routiers de la
// Savoie, dans son propre conteneur (plan de tournée, lot 8, forme B-ter —
// documentation/livraisons/plan-preparation-de-tournee.md, L8-C10/C11).
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
// conteneur ne coûte rien ; il se réveille au premier appel (0,6 s mesurées en
// local, L8-C6 — le démarrage à froid d'une instance `lite` reste à mesurer
// en production).
import { Container } from "@cloudflare/containers";

import { dispatch } from "./dispatch";

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
  // Délai d'INACTIVITÉ : dix minutes sans appel et l'instance s'endort. Assez
  // pour tenir chaude une séance de composition des tournées (plusieurs
  // « Proposer » d'affilée), assez court pour ne pas payer une heure de
  // conteneur pour un calcul de 30 ms. À régler si le réveil gêne (L8-C1).
  sleepAfter = "10m";
}

/**
 * L'instance unique, par un nom fixe : `max_instances: 1`, et un nom
 * déterministe route toujours vers le même conteneur, donc vers celui qui est
 * peut-être encore chaud. OSRM est sans état — rien n'est perdu à en changer.
 */
const INSTANCE = "savoie";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return dispatch(request, {
      tiles: env.MAP_TILES,
      container: () => env.OSRM.get(env.OSRM.idFromName(INSTANCE)),
    });
  },
} satisfies ExportedHandler<Env>;
