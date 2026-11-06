import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { ProductionDossierCopy } from "./copy/mail-copy.model.js";

/**
 * Les données du courriel **« Dossier de production »** (doc
 * `documentation/fournil/dossier-prod-du-jour.md`, « L'envoi par e-mail »).
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
  /** Les réassorts figés au plan (R3d-bis) ; leurs pièces sont DANS `pieceCount`. */
  readonly resupplyCount: number;
  readonly resupplyPieceCount: number;
  /** Toutes les pièces du lot, commandes et réassorts — le compte du PDF. */
  readonly pieceCount: number;
  /** `true` après un retirage : le dossier remplace celui qui était parti. */
  readonly completed: boolean;
  readonly pdfBase64: string;
  /** `dossier-du-jour-AAAA-MM-JJ.pdf`. */
  readonly fileName: string;
}

/** La coquille de l'équipe, prêtée par le registre : la maison y est déjà posée. */
export type StaffShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/** Les mots du dossier, dans la langue de repli : l'équipe lit le français. */
function copyOf(): ProductionDossierCopy {
  return mailCopyOf(DEFAULT_MAIL_LOCALE)["staff.production-dossier"];
}

/** « 1 commande », « 3 commandes » — le singulier jusqu'à un. */
function counted(count: number, one: string, many: string): string {
  return fill(count > 1 ? many : one, { count: String(count) });
}

/**
 * « Dossier de production — plan du mercredi 7 octobre 2026 » ;
 * « Dossier de production complété — … » après un retirage.
 */
export function productionDossierSubject(data: ProductionDossierMailData): string {
  const copy = copyOf();
  return fill(data.completed ? copy.subjectCompleted : copy.subject, { day: data.dayLabel });
}

/** « arrêté par Marie Dupont le … à 20:00 » — sans auteur quand on ne le sait pas. */
function what(data: ProductionDossierMailData, copy: ProductionDossierCopy): string {
  const values = { day: data.dayLabel, by: data.arrestedBy, at: data.arrestedAtLabel };
  const anonymous = data.arrestedBy === "";
  if (data.completed) {
    return fill(anonymous ? copy.completedWithoutAuthor : copy.completed, values);
  }
  return fill(anonymous ? copy.arrestedWithoutAuthor : copy.arrested, values);
}

/**
 * « 3 commandes — 2 en retrait, 1 en livraison — et 40 pièces » ; une part à
 * zéro se tait. Avec des réassorts, comme l'en-tête du PDF : « … — 1 réassort
 * et 58 pièces dont 18 de réassort ».
 */
function figures(data: ProductionDossierMailData, copy: ProductionDossierCopy): string {
  const split = [
    data.pickupCount > 0 ? fill(copy.pickupShare, { count: String(data.pickupCount) }) : "",
    data.deliveryCount > 0 ? fill(copy.deliveryShare, { count: String(data.deliveryCount) }) : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
  const orders = counted(data.orderCount, copy.orderOne, copy.orderMany);
  const pieces = counted(data.pieceCount, copy.pieceOne, copy.pieceMany);
  if (data.resupplyCount > 0) {
    const resupplies = counted(data.resupplyCount, copy.resupplyOne, copy.resupplyMany);
    const share = fill(copy.resupplyPieceShare, {
      pieces,
      count: String(data.resupplyPieceCount),
    });
    const head = split === "" ? orders : fill(copy.ordersWithSplit, { orders, split });
    return fill(copy.figuresWithResupplies, { head, resupplies, share });
  }
  return split === ""
    ? fill(copy.figuresPlain, { orders, pieces })
    : fill(copy.figuresSplit, { orders, split, pieces });
}

/** Le corps, en texte : la coquille en fait le HTML, retours à la ligne compris. */
export function productionDossierBody(data: ProductionDossierMailData): string {
  const copy = copyOf();
  const paragraphs = [
    data.firstName === ""
      ? copy.greetingWithoutName
      : fill(copy.greeting, { firstName: data.firstName }),
    what(data, copy),
    data.resupplyCount > 0 ? copy.attachmentWithResupplies : copy.attachment,
    fill(copy.figures, { figures: figures(data, copy) }),
    ...(data.completed ? [copy.replacesPrevious] : []),
    copy.signature,
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
      kicker: copyOf().kicker,
      title: productionDossierSubject(data),
      body: productionDossierBody(data),
      footer: copyOf().footer,
    }),
    attachments: [
      { filename: data.fileName, contentBase64: data.pdfBase64, contentType: "application/pdf" },
    ],
  };
}
