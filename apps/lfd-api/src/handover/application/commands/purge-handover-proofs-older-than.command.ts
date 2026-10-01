/**
 * **Effacer les pièces de remise plus anciennes que `retentionDays` jours**,
 * comptés depuis l'horloge du backend.
 *
 * Une durée, pas un instant (`HandoverProofRetention`). ⚠️ Rien ne l'émet
 * aujourd'hui : la conservation reste infinie (Hugo, 2026-10-01).
 */
export class PurgeHandoverProofsOlderThanCommand {
  constructor(readonly retentionDays: number) {}
}
