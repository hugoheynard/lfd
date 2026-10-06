import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

/**
 * Les données du courriel **« Dossier de production »** (doc
 * `documentation/production/dossier-prod-du-jour.md`, « L'envoi par e-mail »).
 * Destinataire : une personne de la liste réglée dans Production › Réglages,
 * du personnel ou non.
 *
 * Tout arrive déjà dit : le jour et l'instant en toutes lettres, l'auteur, les
 * comptes, le PDF. Le gabarit ne sait rien du fournil — la plateforme ne
 * connaît aucun contexte.
 */
export interface ProductionDossierMailData {
  /** Vide quand on ne le connaît pas : « Bonjour, » tout court. */
  readonly firstName: string;
  /** Le jour de service en toutes lettres, « mercredi 7 octobre 2026 ». */
  readonly dayLabel: string;
  /** L'arrêt (ou le retirage), heure de Paris : « mardi 6 octobre 2026 à 20:00 ». */
  readonly arrestedAtLabel: string;
  /**
   * Qui : « par Marie Dupont », « automatiquement », ou vide quand on ne le
   * sait pas — la phrase s'écrit alors sans auteur.
   */
  readonly arrestedBy: string;
  readonly orderCount: number;
  readonly pickupCount: number;
  readonly deliveryCount: number;
  readonly pieceCount: number;
  /** `true` après un retirage : le dossier remplace celui qui était parti. */
  readonly completed: boolean;
  readonly pdfBase64: string;
  /** `dossier-du-jour-AAAA-MM-JJ.pdf`. */
  readonly fileName: string;
}

/** La coquille de l'équipe, prêtée par le registre : la maison y est déjà posée. */
export type StaffShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

const SIGNATURE = "La Folie Douce — fournil";

const FOOTER =
  "Cet e-mail part automatiquement à chaque arrêt du plan. Pour ne plus le recevoir, " +
  "demandez à l'équipe de vous retirer des destinataires (Production › Réglages).";

/** « 1 commande », « 3 commandes ». */
function counted(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/**
 * « Dossier de production — plan du mercredi 7 octobre 2026 » ;
 * « Dossier de production complété — … » après un retirage.
 */
export function productionDossierSubject(data: ProductionDossierMailData): string {
  const head = data.completed ? "Dossier de production complété" : "Dossier de production";
  return `${head} — plan du ${data.dayLabel}`;
}

/** « arrêté par Marie Dupont le … à 20:00 » — sans auteur quand on ne le sait pas. */
function when(verb: string, data: ProductionDossierMailData): string {
  const by = data.arrestedBy === "" ? "" : ` ${data.arrestedBy}`;
  return `${verb}${by} le ${data.arrestedAtLabel}`;
}

/** « 3 commandes — 2 en retrait, 1 en livraison — et 40 pièces » ; une part à zéro se tait. */
function figures(data: ProductionDossierMailData): string {
  const split = [
    data.pickupCount > 0 ? `${String(data.pickupCount)} en retrait` : "",
    data.deliveryCount > 0 ? `${String(data.deliveryCount)} en livraison` : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
  const orders = counted(data.orderCount, "commande");
  const pieces = counted(data.pieceCount, "pièce");
  return split === "" ? `${orders} et ${pieces}` : `${orders} — ${split} — et ${pieces}`;
}

/** Le corps, en texte : la coquille en fait le HTML, retours à la ligne compris. */
export function productionDossierBody(data: ProductionDossierMailData): string {
  const hello = data.firstName === "" ? "Bonjour," : `Bonjour ${data.firstName},`;
  const what = data.completed
    ? `Le plan du ${data.dayLabel} a été ${when("complété", data)} : ` +
      "de nouvelles commandes ont été ajoutées à la fournée."
    : `Le plan de production du ${data.dayLabel} a été ${when("arrêté", data)}.`;
  const paragraphs = [
    hello,
    what,
    "Vous trouverez en pièce jointe le dossier à imprimer : un récapitulatif de ce " +
      "qu'il faut fabriquer, puis un bon par commande.",
    `En chiffres : ${figures(data)}.`,
    ...(data.completed ? ["Ce dossier remplace le précédent."] : []),
    SIGNATURE,
  ];
  return paragraphs.join("\n\n");
}

/** Le rendu, à part de `mail-templates.ts` pour ne pas l'alourdir. */
export function renderProductionDossierMail(
  data: ProductionDossierMailData,
  shell: StaffShell,
): RenderedMail {
  return {
    subject: sanitiseSubject(productionDossierSubject(data)),
    html: shell({
      title: productionDossierSubject(data),
      body: productionDossierBody(data),
      footer: FOOTER,
    }),
    attachments: [
      { filename: data.fileName, contentBase64: data.pdfBase64, contentType: "application/pdf" },
    ],
  };
}
