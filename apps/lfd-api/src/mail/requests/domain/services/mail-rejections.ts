const HOUR_MS = 60 * 60_000;

/** La fenêtre des rebonds et plaintes qui font sonner la veille : depuis hier. */
export const MAIL_REJECTIONS_WINDOW_MS = 24 * HOUR_MS;

/** Les e-mails acceptés, comptés par retour du fournisseur. */
export interface MailDeliveryCounts {
  /** Acceptés, sans retour à ce stade. */
  readonly awaitingReturn: number;
  readonly delayed: number;
  readonly delivered: number;
  readonly bounced: number;
  readonly complained: number;
}

/** Les rebonds et plaintes d'un modèle sur la fenêtre. */
export interface MailRejection {
  readonly template: string;
  readonly count: number;
  /** L'instant du plus récent : il fait la clé de la cloche. */
  readonly lastAt: Date;
}

/**
 * Ce qu'on compte : les e-mails acceptés depuis `since`, hors des modèles
 * exclus (la sonde de déploiement, règle 10).
 */
export interface MailDeliveryCriteria {
  readonly since: Date;
  readonly exceptTemplates: readonly string[];
}

/** Les critères de la veille des rebonds à l'instant `now`. */
export function mailRejectionCriteria(
  now: Date,
  exceptTemplates: readonly string[],
): MailDeliveryCriteria {
  return { since: new Date(now.getTime() - MAIL_REJECTIONS_WINDOW_MS), exceptTemplates };
}

/**
 * La clé anti-doublon d'une cloche de rebond : **une par modèle et par rebond
 * le plus récent**. La veille passe toutes les cinq minutes sur une fenêtre de
 * 24 h ; une clé à l'heure ferait resonner le même rebond vingt-quatre fois.
 * Avec l'instant du plus récent, elle ne sonne de nouveau que si un autre
 * rebond (ou une autre plainte) arrive sur le même modèle.
 */
export function mailRejectionAlarmKey(rejection: MailRejection): string {
  return `mail.rejected.${rejection.template}:${rejection.lastAt.toISOString()}`;
}
