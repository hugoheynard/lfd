import type { StopDecision } from "../entities/stop-decision.js";

/**
 * Port d'**écriture** de la décision du commercial (`plan-a-la-porte.md`,
 * § 10 bis) : on la charge, elle se mute par ses méthodes, on la rend.
 */
export abstract class StopDecisionRepository {
  /** La décision vivante de l'arrêt, ou `null` : aucun signalement n'en a ouvert. */
  abstract load(stopId: string): Promise<StopDecision | null>;

  /**
   * Écrit la décision. Ouverte (`loadedVersion` nul) : insérée, sauf si une
   * autre l'a ouverte entre-temps — la première reste, rien n'échoue. Lue :
   * réécrite seulement si sa version en base est encore celle lue.
   *
   * @throws {StopDecisionStaleError} elle a changé depuis la lecture.
   */
  abstract save(decision: StopDecision, label: string): Promise<void>;
}
