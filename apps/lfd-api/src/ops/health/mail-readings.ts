import type { NodeReading } from "@lfd/ops-contract";

/**
 * **Ce que le canal courrier sait dire de lui-même** — pur, donc testable.
 *
 * La question à laquelle ces relevés répondent n'est pas « combien d'e-mails »
 * mais « **est-ce qu'ils arrivent** ». Un envoi qui part sans arriver est le
 * pire cas du canal : rien n'échoue, personne ne s'en plaint, et une cliente
 * attend une invitation qui ne viendra pas.
 */

/** Le décompte par état, sur la fenêtre observée. */
export interface MailTally {
  readonly sent: number;
  readonly delayed: number;
  readonly delivered: number;
  readonly bounced: number;
  readonly complained: number;
}

/**
 * Sept jours et non vingt-quatre heures : le courrier transactionnel est
 * **rare**. Sur une journée, zéro envoi est le cas normal, et un relevé qui
 * affiche zéro la plupart du temps cesse d'être lu — puis cesse d'alerter le
 * jour où le zéro veut dire quelque chose.
 */
export const MAIL_WINDOW_DAYS = 7;

/**
 * L'état de la déclaration, tel que l'écran doit le voir. `null` = on n'a pas
 * pu demander, et on s'abstient : ne rien savoir n'est pas savoir que c'est
 * cassé.
 */
export interface WebhookState {
  readonly healthy: boolean;
  readonly detail: string;
}

/**
 * Le relevé du **retour**, posé avant les volumes.
 *
 * Il répond à la question qu'aucun autre relevé ne pose : « est-ce qu'on sera
 * prévenu si ça casse ? ». Un webhook désactivé rend « Rejetés : 0 »
 * indiscernable d'un canal parfait — c'est le chiffre le plus rassurant de
 * l'écran, et le plus faux. Il passe donc devant.
 */
export function webhookReading(state: WebhookState | null): readonly NodeReading[] {
  if (state === null) {
    return [];
  }
  return [
    {
      label: "Retour",
      // 1 / 0 plutôt qu'un texte : la carte affiche des nombres, et la valeur
      // seule doit distinguer les deux cas sans qu'on ouvre l'infobulle.
      value: state.healthy ? 1 : 0,
      hint: state.healthy
        ? `Webhook Resend : ${state.detail}.`
        : `⚠ Webhook Resend : ${state.detail}. Sans lui, « 0 rejeté » ne veut plus rien dire.`,
    },
  ];
}

export function mailReadings(
  tally: MailTally,
  worstTemplate: string | null,
): readonly NodeReading[] {
  const total = tally.sent + tally.delayed + tally.delivered + tally.bounced + tally.complained;
  if (total === 0) {
    // Aucun envoi : il n'y a rien à dire, et « 0 envoyé » se lirait comme une
    // panne alors que c'est un dimanche. Même règle que le débit de la
    // passerelle — un relevé absent vaut mieux qu'un zéro qui ressemble à une
    // mesure.
    return [];
  }
  const rejected = tally.bounced + tally.complained;
  return [
    {
      label: "Envoyés",
      value: total,
      hint: `Sur ${MAIL_WINDOW_DAYS} jours. ${deliveryDetail(tally)}`,
    },
    {
      label: "Rejetés",
      value: rejected,
      hint: rejectionHint(rejected, worstTemplate),
    },
  ];
}

/**
 * Le détail de livraison. « Sans retour » n'est **pas** un échec : Resend n'a
 * pas encore dit, ou l'événement n'est jamais venu. Le compter comme un rejet
 * ferait rougir le canal pour une lenteur.
 */
function deliveryDetail(tally: MailTally): string {
  const pending = tally.sent + tally.delayed;
  const parts = [`${tally.delivered} délivrés`];
  if (pending > 0) {
    parts.push(`${pending} sans retour à ce stade`);
  }
  return `Dont ${parts.join(", ")}.`;
}

function rejectionHint(rejected: number, worstTemplate: string | null): string {
  if (rejected === 0) {
    return "Rebonds et plaintes. Aucun sur la fenêtre — le canal passe.";
  }
  const blamed = worstTemplate === null ? "" : ` Surtout « ${worstTemplate} ».`;
  return `Rebonds et plaintes : autant de personnes qui n'ont RIEN reçu.${blamed}`;
}
