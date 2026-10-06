import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

/**
 * Les données du courriel **« Dossier du jour »** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, décisions 1-2, lot E3).
 * Destinataire : une personne de la liste réglée dans Production › Réglages,
 * du personnel ou non.
 *
 * Tout arrive déjà dit : le jour en toutes lettres, les comptes, le PDF. Le
 * gabarit ne sait rien du fournil — la plateforme ne connaît aucun contexte.
 */
export interface ProductionDossierMailData {
  /** Vide quand on ne le connaît pas : « Bonjour, » tout court. */
  readonly firstName: string;
  /** Le jour en toutes lettres, « mardi 14 octobre ». */
  readonly dayLabel: string;
  readonly orderCount: number;
  readonly pieceCount: number;
  /** `true` après un retirage : le dossier remplace celui qui était parti. */
  readonly completed: boolean;
  readonly pdfBase64: string;
  /** `dossier-du-jour-AAAA-MM-JJ.pdf`. */
  readonly fileName: string;
}

/** La coquille de l'équipe, prêtée par le registre : la maison y est déjà posée. */
export type StaffShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/** « 1 commande », « 3 commandes ». */
function counted(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/** « Dossier du mardi 14 octobre — 3 commandes, 40 pièces » (« — complété » après un retirage). */
export function productionDossierSubject(data: ProductionDossierMailData): string {
  const base =
    `Dossier du ${data.dayLabel} — ${counted(data.orderCount, "commande")}, ` +
    counted(data.pieceCount, "pièce");
  return data.completed ? `${base} — complété` : base;
}

/** Le corps : court, il ne répète pas le PDF. */
export function productionDossierBody(data: ProductionDossierMailData): string {
  const hello = data.firstName === "" ? "Bonjour," : `Bonjour ${data.firstName},`;
  const what = data.completed
    ? `Le tirage du ${data.dayLabel} a été repris : voici le dossier complété, ` +
      "qui remplace celui reçu à l'arrêt du plan."
    : `Le plan du ${data.dayLabel} est arrêté : voici le dossier du jour à imprimer.`;
  return (
    `${hello}\n\n${what}\n\n` + "Il contient le récapitulatif par rayon, puis un bon par commande."
  );
}

/** Le rendu, à part de `mail-templates.ts` pour ne pas l'alourdir. */
export function renderProductionDossierMail(
  data: ProductionDossierMailData,
  shell: StaffShell,
): RenderedMail {
  return {
    subject: sanitiseSubject(productionDossierSubject(data)),
    html: shell({
      title: data.completed
        ? `Dossier du ${data.dayLabel}, complété`
        : `Dossier du ${data.dayLabel}`,
      body: productionDossierBody(data),
      footer:
        "Vous recevez ce dossier parce que vous êtes inscrit à son envoi dans " +
        "Production › Réglages. Pour ne plus le recevoir, demandez à l'équipe du fournil.",
    }),
    attachments: [
      { filename: data.fileName, contentBase64: data.pdfBase64, contentType: "application/pdf" },
    ],
  };
}
