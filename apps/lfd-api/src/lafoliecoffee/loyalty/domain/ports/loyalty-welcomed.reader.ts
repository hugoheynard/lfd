/**
 * **Cette personne a-t-elle déjà sa ligne `welcome` ?** — lecture seule (ISP),
 * faite SOUS le verrou du titulaire : elle voit ce qu'un crédit concurrent
 * vient de commiter.
 */
export abstract class LoyaltyWelcomedReader {
  abstract isWelcomed(userId: string): Promise<boolean>;
}
