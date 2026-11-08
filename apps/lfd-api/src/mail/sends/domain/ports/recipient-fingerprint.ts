/**
 * Port de l'**empreinte** d'une adresse normalisée (décision 8) : ce que la
 * recherche range à la place de l'adresse. Un port, parce que la clé est un
 * secret serveur lu par `AppConfig`.
 */
export abstract class RecipientFingerprint {
  /** 64 hexadécimaux. */
  abstract of(recipientKey: string): string;
}
