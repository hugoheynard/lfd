/**
 * **Le numéro court d'un export bancaire** — `EXC-<n>` pour les comptes
 * destinataires, `EXM-<n>` pour les mandats (Hugo, 2026-10-23 ; doc
 * `procedure-de-prelevement.md`, « Les identifiants courts et les noms de
 * fichiers »). Le rang vient d'un compteur GLOBAL par sorte, pris à la
 * préparation, qui ne repart jamais à zéro : le numéro est figé avec l'export.
 */
export const BANK_EXPORT_PREFIXES = {
  accounts: "EXC",
  mandates: "EXM",
} as const;

export type BankExportPrefix = (typeof BANK_EXPORT_PREFIXES)[keyof typeof BANK_EXPORT_PREFIXES];

export function bankExportReferenceOf(prefix: BankExportPrefix, rank: number): string {
  return `${prefix}-${String(rank)}`;
}

/**
 * **Le rang d'un fichier dans sa série** — « fichier 1 sur 2 ». Le portail
 * n'importe que 200 lignes par fichier : une file plus longue part en
 * plusieurs fichiers, déposés l'un après l'autre.
 */
export interface ExportPart {
  /** k — le rang de ce fichier, à partir de 1. */
  readonly rank: number;
  /** N — le nombre de fichiers que la série compte À LA PRÉPARATION de celui-ci. */
  readonly count: number;
}

/**
 * Le dernier export de l'entité qui compte pour la série : le plus récent
 * NON abandonné — un abandonné rend ses lignes à la file, et le fichier qui
 * les reprend reprend aussi son rang.
 */
export interface PreviousExportPart {
  readonly part: ExportPart | null;
}

/**
 * **k sur N, à la préparation** :
 *
 * - k = k' + 1 si le dernier export non abandonné de l'entité était le
 *   fichier k' d'une série de N' > k' fichiers ; sinon 1 (pas de série en
 *   cours, ou série terminée, ou export d'avant la numérotation) ;
 * - N = (k − 1) + ⌈file / max⌉, où `file` est le nombre de lignes à exporter
 *   au moment de la préparation, AVANT la coupe à `max` (celles de ce fichier
 *   comprises, celles des exports en vol exclues).
 *
 * Exemple : 237 comptes à exporter, 200 par fichier → « 1 sur 2 » ; une fois
 * celui-ci clos, il en reste 37 → « 2 sur 2 ». Une ligne arrivée entre deux
 * fichiers peut allonger la série : N est figé fichier par fichier.
 */
export function exportPartOf(
  previous: PreviousExportPart | null,
  queueSize: number,
  maxPerFile: number,
): ExportPart {
  const before = previous?.part ?? null;
  const rank = before !== null && before.rank < before.count ? before.rank + 1 : 1;
  const files = Math.max(1, Math.ceil(queueSize / maxPerFile));
  return { rank, count: rank - 1 + files };
}
