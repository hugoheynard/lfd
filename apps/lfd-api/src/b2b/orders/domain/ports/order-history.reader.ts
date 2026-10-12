import type { ActivityEventView } from "@lfd/contracts";

/**
 * Port de **lecture** de l'historique d'une commande : les faits du journal
 * (`growth.activity_events`) qui la concernent, du plus récent au plus ancien.
 *
 * Séparé d'`OrderReader` (plan-page-commandes, C2b) : seul le détail staff le
 * lit, et il ne lit que le journal.
 *
 * `null` = la commande n'existe pas ; une commande sans fait rend `[]`.
 */
export abstract class OrderHistoryReader {
  abstract historyOf(orderId: string): Promise<readonly ActivityEventView[] | null>;
}
