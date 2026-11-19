/**
 * La porte du délai de commande (`order-cutoffs/`) : ce qu'un autre contexte
 * du bloc peut lui demander. Ce fichier ne fait que réexporter.
 */

/**
 * ## Ce que le délai de commande sait répondre
 *
 * Une question, un verdict : ouvert, en rattrapage (avec la dérogation qui
 * ferait passer et son prix), ou fermé — les bornes gardées dans chaque état,
 * et la décision de chaque ligne.
 */
export { OrderDeadline } from "./application/deadline/order-deadline.js";
export type {
  OrderDeadlineAsker,
  OrderDeadlineQuestion,
} from "./application/deadline/order-deadline.js";
export type {
  DeadlineBounds,
  DeadlineSource,
  ExceededItemLimit,
  ItemOrderLimit,
  LineVerdict,
  OrderDeadlineVerdict,
  WaiverAvailable,
} from "./domain/deadline/order-deadline-verdict.js";

/**
 * ## Le juge pur
 *
 * Pour qui a déjà ses données en mémoire et juge beaucoup d'articles à la
 * fois (les suggestions) : la même décision, sans relire.
 */
export {
  generalRuleStatus,
  judgeOrderDeadline,
  priceLateness,
} from "./domain/deadline/judge-order-deadline.js";
export type { DeadlineFacts, DeadlineLine } from "./domain/deadline/judge-order-deadline.js";
