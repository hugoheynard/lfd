import { Injectable } from "@nestjs/common";
import type {
  TrafficReport,
  TrafficSample,
  TrafficSurface,
  TrafficWindow,
} from "@lfd/ops-contract";

import { Clock } from "../../platform/time/clock.js";
import { HISTORY_BUCKET_SECONDS, HISTORY_MINUTES } from "./traffic-query.js";
import { TrafficReader } from "./traffic-reader.port.js";

/**
 * Le lecteur de **répétition** — celui qui tourne tant qu'Analytics Engine n'est
 * pas configuré (ni compte, ni jeton), c'est-à-dire en local et tant que la
 * passerelle n'a pas été redéployée.
 *
 * Il existe pour une raison précise : sans lui, tout ce qui vient après — les
 * agrégats, la carte, l'animation des liens — s'écrirait contre un endpoint qui
 * ne rend rien, donc à l'aveugle. Avec lui, la suite se construit sur une
 * réponse **de la bonne forme**, et le jour où le vrai lecteur prend sa place,
 * il n'y a rien à changer en aval.
 *
 * Deux garde-fous contre le pire risque d'un double — qu'on le prenne pour du
 * vrai :
 *
 *  - il **s'annonce** (`source: "rehearsal"`) jusque dans la réponse HTTP ;
 *  - ses chiffres sont **dérivés de l'horloge**, donc reproductibles et sans
 *    hasard : deux appels dans la même minute rendent la même chose. Un double
 *    qui scintille aurait l'air vivant, et c'est exactement ce qu'on ne veut pas
 *    lui laisser imiter.
 */
@Injectable()
export class RehearsalTrafficReader extends TrafficReader {
  constructor(private readonly clock: Clock) {
    super();
  }

  read(minutes: number): Promise<TrafficReport> {
    const to = new Date(this.clock.now());
    const from = new Date(to.getTime() - minutes * 60_000);
    const seed = Math.floor(to.getTime() / 60_000);

    return Promise.resolve({
      generatedAt: to.toISOString(),
      source: "rehearsal",
      windows: [rehearse("lfd", seed, minutes, from, to)],
      series: [{ node: "lfd", points: rehearseSeries(seed, to) }],
    });
  }
}

/**
 * Une fenêtre plausible et **déterministe**. Les proportions sont choisies pour
 * exercer l'écran plutôt que pour flatter : quelques erreurs, quelques
 * throttles, une latence qui n'est pas nulle. Un double tout vert n'apprendrait
 * rien à la vue qui le consomme.
 */
function rehearse(
  node: string,
  seed: number,
  minutes: number,
  from: Date,
  to: Date,
): TrafficWindow {
  const requests = (seed % 40) * minutes + minutes * 5;
  return {
    node,
    from: from.toISOString(),
    to: to.toISOString(),
    requests,
    serverErrors: Math.floor(requests * 0.012),
    throttled: Math.floor(requests * 0.004),
    gatewayFaults: seed % 17 === 0 ? Math.floor(requests * 0.05) : 0,
    p95Ms: 40 + (seed % 220),
    surfaces: rehearseSurfaces(seed, requests),
  };
}

/**
 * Le détail par surface. Les noms sont ceux que la gateway écrirait VRAIMENT,
 * `channels/_` compris : le canal B2B du référentiel s'appelle `/channels/b2b`,
 * et `b2b` porte un chiffre — donc la gateway le masque. Écrire ici le nom
 * lisible aurait donné l'exemple d'un format qu'on s'interdit, et le tableau
 * aurait promis une finesse qu'il ne peut pas tenir. Un e2e le vérifie.
 *
 * La répartition suit une décroissance franche : dans la vraie vie, deux ou
 * trois appels portent l'essentiel de la charge. Un tableau où tout est égal
 * n'exercerait pas la question qu'on vient lui poser — « lesquels pèsent ? ».
 */
function rehearseSurfaces(seed: number, requests: number): readonly TrafficSurface[] {
  // Les surfaces du SEUL backend derrière la passerelle. Il y en avait deux
  // jeux, aiguillés sur le nœud ; celui du référentiel est parti avec son
  // Worker (B6) — ses routes vivent maintenant sous `/pim` de ce backend-ci.
  const names = ["orders", "admin/companies", "admin/orders", "me", "catalog"];

  return names.map((surface, rank) => {
    const share = Math.pow(0.45, rank);
    const surfaceRequests = Math.max(1, Math.floor(requests * share * 0.5));
    return {
      surface,
      requests: surfaceRequests,
      serverErrors: rank === 2 ? Math.floor(surfaceRequests * 0.04) : 0,
      throttled: rank === 0 ? Math.floor(surfaceRequests * 0.01) : 0,
      gatewayFaults: 0,
      // La surface la plus lente n'est PAS la plus appelée : c'est justement ce
      // décalage qui rend le tableau utile, et il doit se voir en répétition.
      p95Ms: 30 + ((seed + rank * 53) % 400) + (rank === 2 ? 500 : 0),
    };
  });
}

/**
 * Une histoire plausible : un creux de nuit, une bosse de matinée, et un
 * incident isolé. Déterministe comme le reste — une courbe qui bougerait à
 * chaque rafraîchissement aurait l'air vivante, ce qu'un double ne doit jamais
 * imiter.
 *
 * Le relief est là exprès : une courbe plate n'exercerait ni l'échelle, ni le
 * point d'extrémité, ni la lecture qu'on vient lui demander — « est-ce pire que
 * tout à l'heure ». Un double tout plat validerait un rendu qui ne sait rien
 * dessiner.
 */
function rehearseSeries(seed: number, to: Date): readonly TrafficSample[] {
  const buckets = (HISTORY_MINUTES * 60) / HISTORY_BUCKET_SECONDS;
  const endBucket = Math.floor(to.getTime() / 1000 / HISTORY_BUCKET_SECONDS);

  return Array.from({ length: buckets }, (_, index) => {
    const bucket = endBucket - (buckets - 1 - index);
    // Deux journées de 48 tranches : un creux vers 4 h, un pic vers 10 h.
    const hourOfDay = ((bucket * HISTORY_BUCKET_SECONDS) / 3600) % 24;
    const daylight = Math.max(0.08, Math.sin(((hourOfDay - 4) / 24) * Math.PI * 2) * 0.5 + 0.55);
    const requests = Math.round(daylight * (60 + (seed % 40)));
    return {
      at: new Date(bucket * HISTORY_BUCKET_SECONDS * 1000).toISOString(),
      requests,
      failures: bucket % 29 === 0 ? Math.round(requests * 0.18) : 0,
    };
  });
}
