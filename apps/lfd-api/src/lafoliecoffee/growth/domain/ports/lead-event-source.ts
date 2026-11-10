import type { LeadEvent } from "../lead-score.js";

/**
 * Port de lecture **en masse** du journal pour le recompute batch. L'adaptateur
 * ne lit que `growth.activity_events` — le journal reste le seul point de contact
 * de `growth/` avec le reste du système. Le recompute rejoue tout le flux pour
 * reconstruire le read-model `lead_score` (batch, pas temps réel).
 */
export abstract class LeadEventSource {
  abstract all(): Promise<LeadEvent[]>;
}
