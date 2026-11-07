import type { FreeBlock, MailLocale } from '@lfd/mail-blocks';

import { textOf } from './mail-document-edits';

/**
 * **Les fragments du canevas** (plan `plan-editeur-par-blocs.md`, § 22, S5f) —
 * des règles pures sur le HTML que `POST …/block-previews` rend.
 */

// Un attribut de gestionnaire d'événement DANS une balise : le texte d'un
// fragment est échappé par le serveur, un `<` réel ouvre donc une balise.
const EVENT_HANDLER = /<[^>]*[\s/"']on[a-z]+\s*=/i;
const SCRIPT_TAG = /<\s*script/i;
const JAVASCRIPT_URL = /javascript:/i;
// Ce qu'un navigateur ignore dans un schéma d'adresse (`java\tscript:`) :
// les caractères de contrôle et l'espace.
const LAST_IGNORED_CODE = 0x20;

function withoutIgnoredInScheme(value: string): string {
  return [...value].filter((char) => (char.codePointAt(0) ?? 0) > LAST_IGNORED_CODE).join('');
}

/** Les entités numériques décodées : `java&#115;cript:` reste `javascript:`. */
function decodeNumericEntities(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)));
}

/**
 * Défense en profondeur : le serveur échappe toute donnée et n'émet ni script,
 * ni gestionnaire, ni lien `javascript:` (garanti par ses tests, § 22). L'écran
 * refuse quand même un fragment qui en porterait un — il ne l'injecte pas.
 */
export function isSafeMailFragment(html: string): boolean {
  if (SCRIPT_TAG.test(html) || EVENT_HANDLER.test(html)) {
    return false;
  }
  const decoded = withoutIgnoredInScheme(decodeNumericEntities(html));
  return !JAVASCRIPT_URL.test(decoded);
}

const PHRASE_MARK = /data-phrase="([^"]*)"/g;

/** Les chemins des phrases qu'un fragment montre, dans l'ordre, sans doublon. */
export function phrasePathsIn(html: string): readonly string[] {
  const paths = [...html.matchAll(PHRASE_MARK)].map((match) => unescapeAttribute(match[1] ?? ''));
  return [...new Set(paths)];
}

function unescapeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * La zone d'écriture d'un bloc libre que le serveur ne rend pas encore : un
 * titre, un paragraphe ou un encadré sans texte dans cette langue, un bouton
 * sans adresse valable. Sans elle, il n'y aurait rien où cliquer pour écrire.
 * Même marqueur que le serveur (`data-free-block`, `data-locale`) ; une image
 * ou un séparateur n'en ont pas (`null`).
 */
export function freeBlockFallback(block: FreeBlock, locale: MailLocale): string | null {
  if (block.kind === 'image' || block.kind === 'divider') {
    return null;
  }
  const text = escapeHtml(textOf(block, locale));
  const zone = `<span data-free-block="${escapeHtml(block.id)}" data-locale="${locale}">${text}</span>`;
  return block.kind === 'heading' ? `<h2>${zone}</h2>` : `<p>${zone}</p>`;
}
