/** Ce que l'appelant apprend. `sent` ment rarement : un échec lève. */
export interface MailCheckResult {
  readonly sent: boolean;
  readonly from: string;
  readonly to: string;
  readonly revision: string;
}

/**
 * **Le contrôle de mise en service du courrier**, appelé par le workflow après
 * chaque déploiement (`documentation/ops/mailer-resend.md`, § 4 bis) : un
 * `ops.deploy-check` part, depuis l'expéditeur configuré, vers l'admin de
 * secours.
 */
export class CheckMailDeliveryCommand {}
