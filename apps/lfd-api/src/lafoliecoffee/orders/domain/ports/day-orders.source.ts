import type {
  ProducibleOrder,
  ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import type { ClockWindow } from "../services/transfer-departure.js";

/**
 * Une commande du plan, telle que la base la rend — tout le snapshot du
 * fournil SAUF l'échéance, qui dépend des réglages du site (lot T0), et la
 * fenêtre convenue dont l'échéance se déduit.
 */
export interface SourcedDayOrder {
  readonly order: Omit<ProducibleOrder, "dueAt">;
  /** La fenêtre convenue, `HH:mm` ; `null` = aucune. */
  readonly window: ClockWindow | null;
}

/**
 * **Les commandes d'une journée, pour le fournil, avant l'échéance** — la
 * moitié « base » de `DayOrdersReader`, que l'application complète
 * (`SitedDayOrders`).
 *
 * Coupé en deux parce que l'échéance d'un retrait lit désormais les réglages
 * de son site, la position du départ et un trajet routier (T0) : trois ports
 * qu'un adaptateur Prisma n'a pas à orchestrer.
 */
export abstract class DayOrdersSource {
  abstract producibleFor(day: ServiceDay): Promise<readonly SourcedDayOrder[]>;
}
