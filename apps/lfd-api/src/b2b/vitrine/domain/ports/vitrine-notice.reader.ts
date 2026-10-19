import type { VitrineNoticeView } from "@lfd/contracts";

import type { VitrineNoticeCandidate } from "../vitrine-notice-audience.js";

/**
 * Une annonce telle que la base la connaît : l'auteur par son id seulement —
 * son nom se lit dans l'annuaire du staff, à la lecture, jamais recopié.
 */
export type VitrineNoticeEntry = Omit<VitrineNoticeView, "authorName">;

/** Port de lecture des annonces et de leur public. */
export abstract class VitrineNoticeReader {
  /** Tous les abonnés, COUPÉS compris, avec leur contact (ou `null`). */
  abstract candidates(): Promise<readonly VitrineNoticeCandidate[]>;
  /** Les dernières annonces, de la plus récente à la plus ancienne. */
  abstract recent(limit: number): Promise<readonly VitrineNoticeEntry[]>;
}
