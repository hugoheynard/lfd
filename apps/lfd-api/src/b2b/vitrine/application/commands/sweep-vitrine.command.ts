/** Ce qu'un balayage a fait — rendu au Worker, qui l'écrit dans ses journaux. */
export interface VitrineSweepReport {
  /** Les abonnés comparés (allumés, pas en échec). Zéro = rien n'a été calculé. */
  readonly subscribers: number;
  /** Ceux dont la vue a changé : une notification ouverte ou complétée. */
  readonly notified: number;
  /** Les essais d'envoi faits à ce passage. */
  readonly attempted: number;
  readonly delivered: number;
  /**
   * Un autre balayage tenait le bail : celui-ci n'a RIEN fait (ni lecture, ni
   * envoi) — un passage du cron a duré plus de cinq minutes.
   */
  readonly alreadyRunning: boolean;
}

/** Le balayage du cron `*\/5` : comparer les empreintes, puis livrer ce qui est dû. */
export class SweepVitrineCommand {}
