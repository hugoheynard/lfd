import { renderFontHead, renderLayoutHeader } from "./layout-header.js";
import { layoutFragments, supportOf } from "./layout-fragments.js";
import type { LayoutInput } from "./layout-input.js";
import { effectiveSectionOrder, joinSections } from "./layout-sections.js";
import { BRAND, TEXT_FONT_STACK, WHITE } from "./layout-styles.js";

export { htmlEscape } from "./escape.js";
export type { LayoutLogo } from "./layout-header.js";
export type { LayoutImage, LayoutInput, LayoutRow, MailCta } from "./layout-input.js";
export {
  effectiveSectionOrder,
  isLayoutSectionId,
  LAYOUT_SECTIONS,
  type LayoutSectionId,
} from "./layout-sections.js";
export * from "./layout-styles.js";

/**
 * Les primitives de rendu partagées par tous les gabarits : échapper, assainir
 * un objet d'e-mail, et poser la coquille commune.
 *
 * Elles vivent ici et pas dans les apps parce que ce sont exactement les trois
 * choses qu'on écrit de travers quand on les réécrit : un échappement partiel,
 * un objet d'e-mail qui laisse passer un retour à la ligne, une mise en page qui
 * dérive d'un e-mail à l'autre.
 */

/**
 * Assainit une chaîne destinée à l'en-tête `Subject:`.
 *
 * L'objet n'est **pas** du HTML (donc on ne l'échappe pas) mais c'est **un
 * en-tête** : tout caractère de contrôle — au premier chef CR/LF — doit
 * disparaître, sinon une donnée saisie par un utilisateur permet d'injecter des
 * en-têtes. La boucle sur les codes évite une expression régulière de
 * caractères de contrôle (et donc un `eslint-disable`).
 */
export function sanitiseSubject(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/gu, " ").trim();
}

/**
 * La **coquille commune** : un seul gabarit visuel pour toute la suite, pour
 * qu'un e-mail transactionnel n'ait à décider que de ses mots.
 *
 * CSS en ligne uniquement (Gmail retire les `<style>`), aucune image DISTANTE,
 * aucune police externe — les trois contraintes qui font qu'un e-mail s'affiche
 * partout. Les images (logo, QR) voyagent en pièce jointe en ligne et sont
 * citées par `cid:` (cette phrase disait « aucune image » jusqu'au 2026-10-23,
 * date où le logo est entré en en-tête).
 * **Tout est échappé ici** : un gabarit appelant n'a jamais à y penser.
 */
export function renderLayout(input: LayoutInput): string {
  return renderLayoutFrame(
    input,
    joinSections(
      layoutFragments(input),
      effectiveSectionOrder(input.sections),
      input.markSections === true,
    ),
  );
}

/**
 * Ce qu'un document réarrangé ajoute au cadre (S4b) : son `<head>` (variante
 * sombre, empilement des colonnes), la langue de l'envoi, et les classes que
 * ce `<head>` vise. Absent, le cadre est celui de la coquille, à l'octet.
 */
export interface LayoutFrameTheme {
  readonly head: string;
  readonly lang: string;
  readonly pageClass: string;
  readonly cardClass: string;
}

/**
 * Le cadre de l'e-mail autour d'un corps déjà assemblé : page, carte,
 * bandeau, recours. Partagé par la coquille et le rendu d'un document.
 */
export function renderLayoutFrame(
  input: LayoutInput,
  content: string,
  theme?: LayoutFrameTheme,
): string {
  const header = renderLayoutHeader(input, { band: BRAND.navyDeep, radius: BRAND.radius });
  const head = theme === undefined ? renderFontHead(input.brandFontUrl) : theme.head;
  const lang = theme === undefined ? "fr" : theme.lang;
  const pageClass = theme === undefined ? "" : ` class="${theme.pageClass}"`;
  const cardClass = theme === undefined ? "" : ` class="${theme.cardClass}"`;

  return `<!doctype html>
<html lang="${lang}">${head}
  <body${pageClass} style="margin:0;padding:24px;font-family:${TEXT_FONT_STACK};color:${BRAND.ink};background:${BRAND.ivory};">
    <table${cardClass} role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:${WHITE};border:1px solid ${BRAND.border};border-radius:${BRAND.radius};">
      ${header}
      <tr><td style="padding:32px 32px 8px;">
        ${content}
      </td></tr>
      ${supportOf(input)}
    </table>
  </body>
</html>`;
}
