/**
 * Ce que l'appelant apprend. `sent` ment rarement : un échec lève. Les deux
 * chemins sont dits (plan `plan-service-e-mails.md`, § 25) : `immediate` par
 * `sendAndAwaitReceipt`, `deferred` par `send` et la boîte d'envoi.
 */
export interface MailCheckResult {
  readonly sent: boolean;
  readonly immediate: "sent";
  readonly deferred: "sent";
  readonly from: string;
  readonly to: string;
  readonly revision: string;
  /** Les espaces dont l'identité d'envoi rangée a été éprouvée (C3) ; vide : la configuration seule. */
  readonly senderSpaces: readonly string[];
}

/**
 * **Le contrôle de mise en service du courrier**, appelé par le workflow après
 * chaque déploiement (`documentation/ops/mailer-resend.md`, § 4 bis) : un
 * `ops.deploy-check` part, depuis l'expéditeur configuré, vers l'admin de
 * secours. Deux fois : sur-le-champ, puis en différé (§ 25).
 */
export class CheckMailDeliveryCommand {}
