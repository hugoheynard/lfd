import type { BillingRhythmKind } from "./legal-entity.js";

/**
 * **Une période d'un rythme, et ses trois jalons** — calculés par le serveur
 * (`collectionCalendar`, la fonction du lot), jamais par l'écran : un second
 * calcul de TARGET2 côté front dirait tôt ou tard une autre date que le fichier.
 *
 * Tous les jours sont des jours LOCAUX de Paris (`AAAA-MM-JJ`).
 */
export interface BillingRhythmPeriodView {
  /** ISO — la clôture (exclusive), minuit de Paris. */
  readonly closesAt: string;
  /** La veille de la clôture : la facture de la période est émise ce jour-là (23h55). */
  readonly invoicedOn: string;
  /**
   * Le jour où l'avis de prélèvement part : celui de la préparation PRÉVUE du
   * lot (clôture + délai de l'automatisme). Une préparation plus tardive le
   * décale, et l'échéance avec (D4) — le calendrier dit le prévu.
   */
  readonly noticeOn: string;
  /** L'échéance (`ReqdColltnDt`), jour ouvré TARGET2. */
  readonly collectionDay: string;
}

/** Un rythme de l'entité, et ses périodes qui touchent l'axe. */
export interface BillingRhythmLaneView {
  readonly mode: BillingRhythmKind;
  /**
   * Le rythme est-il suivi aujourd'hui ? Mensuel toujours (le défaut de qui
   * n'a rien choisi), les deux autres s'ils sont le mode en vigueur d'au
   * moins un payeur — la règle du calendrier de l'entité (§16.6-6).
   */
  readonly followed: boolean;
  /** Les payeurs dont c'est le mode en vigueur aujourd'hui. Mensuel : ceux qui l'ont CHOISI. */
  readonly payerCount: number;
  /** Les périodes dont un jalon tombe sur l'axe, la plus ancienne d'abord. */
  readonly periods: readonly BillingRhythmPeriodView[];
}

/**
 * **Le calendrier des trois rythmes d'une entité**
 * (`GET admin/accounting/legal-entities/:id/billing-modes/calendar`) : un axe
 * de jours, et pour chaque rythme ses clôtures, ses avis et ses échéances.
 */
export interface BillingRhythmsCalendarView {
  readonly legalEntityId: string;
  /** Aujourd'hui, à Paris. */
  readonly today: string;
  /** Premier jour de l'axe (un lundi), inclus. */
  readonly startsOn: string;
  /** Dernier jour de l'axe, EXCLU. */
  readonly endsOn: string;
  /** Le délai de pré-notification réglé sur l'entité, en jours. */
  readonly preNotificationDays: number;
  /** Hebdomadaire, deux fois par mois, mensuel — dans cet ordre. */
  readonly rhythms: readonly BillingRhythmLaneView[];
}
