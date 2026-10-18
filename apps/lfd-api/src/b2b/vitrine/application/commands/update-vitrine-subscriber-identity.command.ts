/** Renommer un abonné, dire à quoi il sert, et où écrire à l'agence. */
export class UpdateVitrineSubscriberIdentityCommand {
  constructor(
    readonly subscriberId: string,
    readonly name: string,
    /** Vide ou `null` : la description est effacée. */
    readonly description: string | null,
    /** Vide ou `null` : le contact est effacé. */
    readonly contactEmail: string | null,
  ) {}
}
