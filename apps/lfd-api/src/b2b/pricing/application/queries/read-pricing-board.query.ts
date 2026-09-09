/**
 * « Quelles décisions tarifaires étaient en vigueur, et à quel prix
 * aboutissent-elles ? »
 *
 * L'instant est **porté par la question**, pas lu par celui qui y répond :
 * l'écran demande parfois un jour passé, et une lecture qui irait chercher
 * l'heure elle-même ne saurait pas répondre à celle-là.
 */
export class ReadPricingBoardQuery {
  constructor(readonly at?: Date) {}
}
