/**
 * Command : **recalculer** le read-model `lead_score` depuis le journal. Sans
 * paramètre — le recompute est global (rejoue tout le flux). Déclenchée par le
 * Cloudflare Cron Trigger (`POST /admin/recompute`), 3×/jour aux heures creuses.
 */
export class RecomputeLeadScoresCommand {}
