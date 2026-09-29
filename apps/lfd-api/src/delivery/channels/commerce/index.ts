/**
 * **Le canal que la livraison publie POUR le commerce** : des classes
 * abstraites qu'il implémente. `lint:context-boundaries` n'autorise
 * `b2b → delivery` que par ce chemin.
 */
export {
  DepartureCandidatesReader,
  type DepartureCandidate,
} from "./departure-candidates.reader.js";
