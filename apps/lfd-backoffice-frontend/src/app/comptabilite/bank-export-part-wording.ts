/**
 * **Le découpage d'un export en fichiers, dit en clair** sur les cartes
 * « Comptes à la banque » et « Mandats à la banque » (Hugo, 2026-10-23 ; doc
 * `procedure-de-prelevement.md`, « Les identifiants courts et les noms de
 * fichiers »). Le rang « k sur N » est figé par le serveur à la préparation ;
 * l'écran ne fait que le dire.
 */

/** Ce qu'un export a figé et qui le nomme. */
export interface NumberedExport {
  readonly reference: string;
  readonly part: { readonly rank: number; readonly count: number } | null;
}

/** Le nom d'une ligne, au singulier puis au pluriel : `['compte', 'comptes']`. */
export type ExportNoun = readonly [string, string];

function counted(count: number, [one, many]: ExportNoun): string {
  return `${String(count)} ${count > 1 ? many : one}`;
}

/**
 * « EXC-12 · Fichier 1 sur 2 — 200 comptes. Les 37 suivants partiront dans le
 * fichier 2, une fois celui-ci déposé dans CENET. », puis « EXC-13 · Fichier
 * 2 sur 2 — 37 comptes. ». `waiting` : les lignes à exporter hors de ce
 * fichier. Un export d'avant la numérotation n'a pas de rang : son numéro et
 * son compte seulement.
 */
export function exportPartSentence(
  item: NumberedExport,
  lineCount: number,
  waiting: number,
  noun: ExportNoun,
): string {
  const lines = counted(lineCount, noun);
  if (item.part === null) {
    return `${item.reference} — ${lines}.`;
  }
  const head = `${item.reference} · Fichier ${String(item.part.rank)} sur ${String(item.part.count)} — ${lines}.`;
  if (waiting <= 0) {
    return head;
  }
  const next = item.part.rank + 1;
  const suivants = waiting > 1 ? `Les ${String(waiting)} suivants partiront` : 'Le suivant partira';
  return `${head} ${suivants} dans le fichier ${String(next)}, une fois celui-ci déposé dans CENET.`;
}
