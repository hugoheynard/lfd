/**
 * **Le Markdown en ligne du guide, traduit en HTML** — `code`, **gras**,
 * *italique*, rien d'autre. Tout le reste est échappé : la prose du guide
 * (`vitrine-guide-content.ts`) cite du XML (`<item>`), qui doit s'afficher et
 * non s'interpréter.
 *
 * Le contenu d'un `code` n'est jamais relu pour du gras : `"test": true` ou
 * `<t>.<corps brut>` y restent littéraux.
 */
export function renderInlineMarkdown(text: string): string {
  return text
    .split('`')
    .map((segment, index) =>
      index % 2 === 1 ? `<code>${escapeHtml(segment)}</code>` : emphasis(escapeHtml(segment)),
    )
    .join('');
}

function emphasis(html: string): string {
  return html
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>');
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
