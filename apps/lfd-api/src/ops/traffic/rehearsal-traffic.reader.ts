import { Injectable } from "@nestjs/common";
import type { TrafficReport, TrafficSurface, TrafficWindow } from "@lfd/ops-contract";

import { Clock } from "../../platform/time/clock.js";
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
      windows: [
        rehearse("b2b", seed, minutes, from, to),
        rehearse("pim", seed + 7, minutes, from, to),
      ],
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
    surfaces: rehearseSurfaces(node, seed, requests),
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
function rehearseSurfaces(node: string, seed: number, requests: number): readonly TrafficSurface[] {
  const names =
    node === "pim"
      ? ["catalogue/products", "channels/_", "commerce/tva-regimes", "locations/emplacements"]
      : ["orders", "admin/companies", "admin/orders", "me", "catalog"];

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
