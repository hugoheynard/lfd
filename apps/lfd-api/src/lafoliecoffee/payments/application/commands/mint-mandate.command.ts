/**
 * **Frapper** le mandat d'une société : lui donner une RUM et un papier à
 * imprimer, sans rien signer.
 *
 * Aucune charge utile au-delà de la société. Tout ce que le mandat porte est
 * déjà en base — l'entité émettrice, la référence du client, les zones du
 * formulaire — et le faire entrer par la requête ferait recopier à l'écran des
 * données dont nous sommes la source. C'est aussi ce qui rend le geste
 * rejouable : deux clics donnent le même mandat, pas deux.
 */
export class MintMandateCommand {
  constructor(readonly companyId: string) {}
}
