/** Régénérer le secret et la clé d'un abonné. Rend les neufs — montrés une seule fois. */
export class RotateVitrineCredentialsCommand {
  constructor(readonly subscriberId: string) {}
}
