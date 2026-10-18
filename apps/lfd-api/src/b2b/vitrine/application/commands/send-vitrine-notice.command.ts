/**
 * Écrire aux contacts des abonnés (« Notifier les abonnés », Hugo
 * 2026-10-18). Rend l'id de l'annonce — celle d'un premier clic si la clé
 * d'idempotence a déjà servi.
 */
export class SendVitrineNoticeCommand {
  constructor(
    readonly authorStaffId: string,
    readonly subject: string,
    readonly message: string,
    /** `null` : tous les abonnés qui ont un contact. */
    readonly subscriberIds: readonly string[] | null,
    readonly idempotencyKey: string,
  ) {}
}
