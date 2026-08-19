import { Injectable } from "@nestjs/common";
import type { TrafficReport, TrafficWindow } from "@lfd/ops-contract";

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
  };
}
