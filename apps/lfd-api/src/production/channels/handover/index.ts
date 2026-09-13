/**
 * **Le canal que la production publie POUR le retrait.**
 *
 * Une seule pièce aujourd'hui, et c'est bien : la production ne demande au
 * retrait qu'une chose. `lint:context-boundaries` n'autorise `handover →
 * production` que par ce chemin.
 */
export { AttestedHandoversReader } from "./attested-handovers.reader.js";
