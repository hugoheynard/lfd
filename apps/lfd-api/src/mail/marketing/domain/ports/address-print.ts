/**
 * Port de l'**empreinte à clé** d'une adresse normalisée (plan de
 * désinscription, contradiction : « l'effacement ne rouvre pas la porte »).
 * Un port, parce que la clé est un secret serveur lu par `AppConfig`.
 */
export abstract class AddressPrint {
  /** 64 hexadécimaux, toujours les mêmes pour la même clé d'adresse. */
  abstract of(recipientKey: string): string;
}
