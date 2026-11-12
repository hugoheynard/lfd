/** Régénérer le secret et la clé d'un abonné. Rend les neufs — montrés une seule fois. */
export class RotateVitrineCredentialsCommand {
  constructor(
    readonly subscriberId: string,
    /** La fiche du staff qui fait tourner : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double clic ne fait pas tourner deux fois. */
    readonly intentKey: string,
  ) {}
}
