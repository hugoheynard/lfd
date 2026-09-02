/**
 * **La plateforme accepte ce que le référentiel a livré.**
 *
 * Le geste qui n'existait nulle part, et c'est lui qui fait que « livrer » cesse
 * d'être « mettre en vente ». Il clôt l'arrivée **en une fois** : il n'existe
 * jamais d'arrivée à moitié validée, donc une livraison qui remplace la
 * précédente ne peut détruire aucun travail à moitié fait.
 */
export class AcceptDeliveryCommand {
  constructor(
    /** L'arrivée qu'on vient de relire — pas « la courante » : elle a pu changer. */
    readonly deliveryId: string,
    /**
     * Les SKU **écartés**. Ils gardent leurs faits courants — ils n'ont
     * simplement pas changé.
     *
     * C'est la troisième voie entre deux mauvaises réponses. Le tout-ou-rien
     * bloque : un catalogue dont **un** article porte un prix faux ne se valide
     * pas, et plus le catalogue grossit, plus la probabilité qu'un article
     * annule la relecture des autres monte. La validation étalée, elle, laisse
     * des restes qu'une livraison suivante détruit.
     *
     * Un prix faux s'écarte, les autres passent, et l'arrivée est close.
     */
    readonly excludedSkus: readonly string[],
    /** Qui valide — le fait est imputable, et le journal le dira. */
    readonly acceptedBy: string | null,
  ) {}
}
