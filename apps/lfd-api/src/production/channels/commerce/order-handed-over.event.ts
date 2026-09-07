import type { HandoverVia } from "../../domain/services/handover.js";

/**
 * **Une commande a été remise** — constaté au comptoir du fournil.
 *
 * ## Deux faits, pas un — comme pour le colisage
 *
 * Celui-ci appartient à la PRODUCTION : c'est au labo qu'on retire, et celui qui
 * voit le client partir avec son sac est le seul à pouvoir l'attester. Le
 * commerce en tire le sien — `fulfilled` — et republie `OrderHandedOverEvent`
 * côté commerce, que le journal écoute déjà.
 *
 * Les deux portent le même nom, et c'est le seul cas du dossier où c'est
 * volontaire : il n'y a **rien** à distinguer entre « remise constatée » et
 * « commande remise ». Le jour où il y aurait quelque chose — un retour, une
 * remise partielle —, ce sera le signe qu'ils doivent se séparer.
 *
 * ## Ce qu'il porte
 *
 * La **référence**, pas l'identifiant : c'est elle qu'on lit sur le bon, et le
 * commerce sait la résoudre. Le `via` voyage avec, parce que le commerce le
 * recopie dans son snapshot — sans lui, une remise saisie deviendrait un scan en
 * traversant la frontière, ce qui est précisément la confusion que ce champ
 * existe pour empêcher.
 *
 * ⚠️ Comme tout ce qui passe par ce bus, il vit **en processus** et n'est ni
 * persisté ni rejoué. L'abonné doit être idempotent.
 */
export class OrderHandedOverEvent {
  constructor(
    /** La référence lisible, `ORD-…`. */
    readonly reference: string,
    /** L'instant de la remise, pris au port d'horloge du fournil. */
    readonly handedOverAt: Date,
    /** L'identité staff qui a constaté (claim `sub`), figée. */
    readonly handedOverBy: string,
    /** `scan` ou `manual` — l'attestation forte ou l'honnête. */
    readonly via: HandoverVia,
  ) {}
}
