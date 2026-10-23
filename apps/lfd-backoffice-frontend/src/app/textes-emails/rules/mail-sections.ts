import type {
  MailCopyMailView,
  MailCopyTextView,
  MailSectionOrderView,
  MailSectionTextView,
} from '@lfd/contracts';

import { pathLabel } from './mail-labels';

/** Les deux cadres immobiles d'un e-mail (E4, S2) : l'objet et l'en-tête. */
export type MailFrame = 'subject' | 'header';

/**
 * Une carte de l'écran, nommée comme l'aperçu la désigne : `frame:subject`,
 * `frame:header`, ou `section:<id>` (le `data-mail-section` du serveur).
 */
export type MailCardKey = `frame:${MailFrame}` | `section:${string}`;

/** Ce que l'écran met en évidence : une carte, et le texte qu'on a désigné s'il y en a un. */
export interface MailSpot {
  readonly card: MailCardKey;
  readonly path: string | null;
}

export const FRAME_LABELS: Readonly<Record<MailFrame, string>> = {
  subject: 'Objet',
  header: 'En-tête',
};

/**
 * Ce que montre une section produite par les données (S1). Les identifiants
 * sont ceux de la coquille (`packages/mailer/src/layout-sections.ts`, huit,
 * relus le 2026-10-23) ; une section inconnue garde la phrase générique.
 */
const SYSTEM_SHOWS: Readonly<Record<string, string>> = {
  summary: 'Les lignes et les montants de l’envoi.',
  image: 'Une image produite pour l’envoi — le QR de retrait.',
  itinerary: 'Le lien d’itinéraire vers le point de retrait, absent pour une livraison.',
  cta: 'Le bouton et l’adresse vers laquelle il mène.',
  secondaryLink: 'Un lien vers une page de l’espace client.',
  title: 'Un titre saisi ailleurs, propre à chaque envoi.',
  body: 'Un texte saisi ailleurs, propre à chaque envoi.',
};

/** La phrase d'une carte « Système » : ce qu'elle montre, et que les données la produisent. */
export function systemDescription(sectionId: string): string {
  const shows = SYSTEM_SHOWS[sectionId] ?? 'Un bloc produit par les données de l’envoi.';
  return `${shows} Produit par les données : seuls ses libellés se réécrivent.`;
}

/**
 * L'ordre après avoir déplacé `id` d'un cran (`-1` : plus haut). `null` quand
 * le geste ne bouge rien — déjà en tête, déjà en bas, ou section inconnue.
 */
export function movedOrder(
  ids: readonly string[],
  id: string,
  delta: -1 | 1,
): readonly string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) {
    return null;
  }
  const next = [...ids];
  next[from] = ids[to] ?? id;
  next[to] = id;
  return next;
}

/** L'ordre attend « Publier » : un brouillon posé, ou un retour à l'ordre du code. */
export function orderPending(order: MailSectionOrderView): boolean {
  return order.draftState !== 'unchanged';
}

/** Il y a un ordre à défaire : un brouillon, ou un ordre publié qui n'est pas celui du code. */
export function canResetOrder(order: MailSectionOrderView): boolean {
  return (
    order.draftState === 'set' || (order.draftState === 'unchanged' && order.published !== null)
  );
}

/**
 * Le nom d'un texte dans sa carte (S6) : sa variante — QUAND il s'affiche —
 * s'il en a une ; seul dans sa carte, aucun (le titre de la carte suffit) ;
 * sinon le nom de son chemin.
 */
export function textHeading(text: MailSectionTextView, siblings: number): string | null {
  if (text.variant !== null) {
    return text.variant;
  }
  return siblings > 1 ? pathLabel(text.path) : null;
}

/** Les textes de l'e-mail qu'aucune carte ne range (un `alt` d'image) : ils restent éditables. */
export function unplacedTexts(mail: MailCopyMailView): readonly MailCopyTextView[] {
  const placed = new Set(
    [...mail.frames.subject, ...mail.frames.header, ...mail.sections.flatMap((s) => s.texts)].map(
      (text) => text.path,
    ),
  );
  return mail.texts.filter((text) => !placed.has(text.path));
}

/**
 * La carte désignée par un clic dans l'aperçu (S4). Un texte de CET e-mail
 * désigne la carte qui le range — cadre compris, qui n'a pas de
 * `data-mail-section` ; un texte emprunté à un autre e-mail (`of` différent)
 * ne désigne que sa section.
 */
export function locateInPreview(
  mail: MailCopyMailView,
  sectionId: string | null,
  path: string | null,
  of: string | null,
): MailSpot | null {
  const own = path !== null && of === mail.mail ? path : null;
  if (own !== null) {
    for (const frame of ['subject', 'header'] as const) {
      if (mail.frames[frame].some((text) => text.path === own)) {
        return { card: `frame:${frame}`, path: own };
      }
    }
    const holder = mail.sections.find((section) => section.texts.some((t) => t.path === own));
    if (holder !== undefined) {
      return { card: `section:${holder.id}`, path: own };
    }
  }
  if (sectionId !== null && mail.sections.some((section) => section.id === sectionId)) {
    return { card: `section:${sectionId}`, path: null };
  }
  return null;
}
