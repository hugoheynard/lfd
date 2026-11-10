/** Le compte PRÉSUMÉ d'un expéditeur : rien ne prouve qu'il a écrit. */
export interface PresumedAccount {
  readonly userId: string;
}

/**
 * Port de **lecture** : le compte client que désigne une adresse d'expédition
 * (plan `plan-reponses-par-e-mail.md`, §2). Une adresse inconnue, ou que
 * plusieurs comptes portent, ne désigne PERSONNE : on ne choisit pas.
 */
export abstract class EmailSenderAccountReader {
  abstract presumedOf(email: string): Promise<PresumedAccount | null>;
}
