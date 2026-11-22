/**
 * **Rattrape les premiers paiements que la reprise n'a pas vus** (plan M2,
 * §4.3, §4.6) — horaire, du déploiement de P0 jusqu'au resserrement P2.
 * Émise par le cron, jamais par un client.
 */
export class ReplayFirstPaymentsCommand {}

/** Un écart signalé : la ligne et le sujet ne disent pas la même chose, et rien ne les rapproche. */
export interface FirstPaymentDivergence {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly providerRef: string;
  /** L'état de la ligne ; `null` : la ligne n'a pas pu être écrite. */
  readonly line: string | null;
  /** Le règlement tel que le sujet le voit. */
  readonly subject: string;
}

/**
 * Ce que le rattrapage a fait. `no_takeover` : sans ligne-témoin (une base
 * de test vidée), il ne fait rien — et le dit.
 */
export type FirstPaymentsReplayReport = { readonly status: "no_takeover" } | FirstPaymentsReplayed;

/** Le rattrapage a tourné. */
export interface FirstPaymentsReplayed {
  readonly status: "replayed";
  /** Les références lues chez les sujets, plus les vieux impayés relus. */
  readonly examined: number;
  readonly inserted: number;
  readonly advanced: number;
  readonly inStep: number;
  readonly diverged: readonly FirstPaymentDivergence[];
}
