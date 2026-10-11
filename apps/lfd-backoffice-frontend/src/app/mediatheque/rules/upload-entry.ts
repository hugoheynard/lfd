/**
 * Où en est UN fichier du lot. `already_in_library` (« déjà au fonds ») n'est pas un échec : les
 * octets y étaient, et rien n'a changé — pas même la série.
 */
export type UploadState = 'waiting' | 'sending' | 'deposited' | 'already_in_library' | 'refused';

/** Qui a refusé : le poste, avant l'envoi, ou le serveur. */
export type RefusedBy = 'device' | 'server';

/**
 * Un fichier du lot, et ce qu'il est devenu.
 *
 * Le fichier lui-même est gardé : c'est ce qui permet de **réessayer** ceux qui
 * ont échoué sans redemander à quelqu'un de retrouver les bons dans son
 * explorateur — le geste le plus pénible d'un import en lot raté.
 */
export interface UploadEntry {
  readonly file: File;
  readonly name: string;
  readonly state: UploadState;
  /** Le refus, en français. `null` tant qu'il n'y a pas de refus. */
  readonly reason: string | null;
  /** `null` tant qu'il n'y a pas de refus. Un refus du poste ne se réessaie pas. */
  readonly refusedBy: RefusedBy | null;
  /**
   * La série que l'image porte APRÈS le dépôt — celle d'origine si elle était
   * déjà au fonds. `null` : aucune, ou pas encore déposée.
   */
  readonly seriesId: string | null;
}

/** Un fichier qui vient d'entrer dans la file : rien ne lui est encore arrivé. */
export function waitingEntry(file: File): UploadEntry {
  return { file, name: file.name, state: 'waiting', reason: null, refusedBy: null, seriesId: null };
}

/**
 * Seul un refus du SERVEUR se réessaie : un fichier refusé par le poste le
 * serait à nouveau, octets inchangés.
 */
export function isRetriable(entry: UploadEntry): boolean {
  return entry.state === 'refused' && entry.refusedBy === 'server';
}

/** Remet en file un refus du serveur ; les autres restent ce qu'ils sont. */
export function retried(entry: UploadEntry): UploadEntry {
  return isRetriable(entry) ? { ...entry, state: 'waiting', reason: null, refusedBy: null } : entry;
}
