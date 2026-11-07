/**
 * Ce qu'un document refuse. Les règles sont tenues au SERVEUR (plan
 * `plan-editeur-par-blocs.md`, § 2) : l'écran les montre, l'API les oppose.
 * Le paquet ne lève rien — il rend la liste, l'API la traduit en refus.
 */
export const MAIL_DOCUMENT_VIOLATION_CODES = [
  "template-mismatch",
  "duplicate-block-id",
  "model-block-missing",
  "model-block-repeated",
  "model-block-undeclared",
  "unknown-block-kind",
  "model-block-in-column",
  "columns-in-column",
  "column-count",
  "column-cells-mismatch",
  "column-width-step",
  "column-widths-sum",
  "long-block-in-three-columns",
  "href-not-https",
  "unknown-callout-tone",
  "missing-text",
] as const;

export type MailDocumentViolationCode = (typeof MAIL_DOCUMENT_VIOLATION_CODES)[number];

/**
 * Un refus : son code, le bloc en cause s'il y en a un, et un message lu par
 * l'équipe sans le code sous les yeux — le cas réel et le geste de sortie.
 */
export interface MailDocumentViolation {
  readonly code: MailDocumentViolationCode;
  readonly blockId: string | null;
  readonly message: string;
}

export function violation(
  code: MailDocumentViolationCode,
  blockId: string | null,
  message: string,
): MailDocumentViolation {
  return { code, blockId, message };
}
