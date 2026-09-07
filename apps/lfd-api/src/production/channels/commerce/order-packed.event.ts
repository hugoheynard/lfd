/**
 * **Le bac d'une commande est fait** — le colisage, constaté au fournil.
 *
 * ## Deux faits, pas un
 *
 * Celui-ci appartient à la PRODUCTION : c'est elle qui ferme le bac, et personne
 * d'autre ne peut le constater. Le commerce en tire le sien — `ready`, « prête
 * pour le client » — et publie à son tour `OrderReadyEvent`, que le journal et
 * le courriel écoutent déjà.
 *
 * Les nommer pareil aurait été une erreur : « colisé » dit ce qu'on a fait,
 * « prête » dit ce que le client peut attendre. Le jour où un colis fait n'est
 * pas encore remettable — un bac fermé qui attend le froid, par exemple —, les
 * deux se sépareront sans qu'on ait à renommer quoi que ce soit.
 *
 * ## Ce qu'il porte, et ce qu'il ne porte pas
 *
 * La **référence**, pas l'identifiant : c'est elle que le fournil scanne et lit,
 * et le commerce sait la résoudre. L'identité staff est figée — elle vient du
 * jeton, jamais de la charge utile.
 *
 * Aucun montant, aucune ligne : le commerce a déjà tout ça. Un événement qui
 * recopierait l'état créerait une seconde vérité.
 *
 * ⚠️ Comme tout ce qui passe par ce bus, il vit **en processus** et n'est ni
 * persisté ni rejoué. L'abonné doit être idempotent — `markReady` l'est par sa
 * condition d'état.
 */
export class OrderPackedEvent {
  constructor(
    /** La référence lisible, `ORD-…` — celle qui est écrite sur la feuille. */
    readonly reference: string,
    /** L'instant du colisage, pris au port d'horloge. */
    readonly packedAt: Date,
    /** L'identité staff qui a scanné (claim `sub`), figée. */
    readonly packedBy: string,
  ) {}
}
