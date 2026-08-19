import type { TrafficReport } from "@lfd/ops-contract";

/**
 * Port **TrafficReader** — d'où OPS tire ce que la gateway a vu passer.
 *
 * Une seule méthode, et un rapport qui **dit d'où viennent ses chiffres**
 * (`source`). Ce n'est pas de la décoration : sans cet aveu, un écran branché
 * sur le double de répétition ressemblerait trait pour trait à un écran branché
 * sur la production. C'est la panne d'observabilité la plus coûteuse — on croit
 * regarder, on ne regarde rien.
 */
export abstract class TrafficReader {
  /** La fenêtre glissante des `minutes` dernières minutes, par nœud. */
  abstract read(minutes: number): Promise<TrafficReport>;
}
