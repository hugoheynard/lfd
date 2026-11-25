/**
 * **Les colonnes qu'on peut masquer** dans le carnet d'adresses de Tour manager
 * (Hugo, 2026-11-25). Le client reste toujours visible : sans lui, une ligne
 * ne dit plus de qui elle parle.
 *
 * Le choix est retenu dans CE navigateur : c'est un confort d'affichage, et une
 * mémoire illisible ou refusée (navigation privée) rend simplement le réglage
 * par défaut.
 */
export const ADDRESS_BOOK_OPTIONAL_COLUMNS = [
  { key: 'address', label: 'Adresse' },
  { key: 'contact', label: 'Contact' },
  { key: 'note', label: 'Note livreurs' },
  { key: 'parking', label: 'Stationnement' },
  { key: 'deposit', label: 'Dépôt' },
  { key: 'rule', label: 'Règle à la porte' },
  { key: 'stop', label: 'Temps sur place' },
  { key: 'procedure', label: 'Procédure' },
] as const;

/** Masquées tant que personne n'a choisi (Hugo, 2026-11-25) : la table tient sans défilement horizontal. */
export const ADDRESS_BOOK_HIDDEN_BY_DEFAULT: readonly string[] = ['parking', 'rule', 'stop'];

const STORAGE_KEY = 'lfd.tour-manager.address-book.hidden-columns';

/** Les colonnes masquées retenues, ou le réglage par défaut. */
export function readHiddenColumns(storage: Storage | null): readonly string[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY) ?? null;
    if (raw === null) {
      return ADDRESS_BOOK_HIDDEN_BY_DEFAULT;
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')
      ? parsed
      : ADDRESS_BOOK_HIDDEN_BY_DEFAULT;
  } catch {
    return ADDRESS_BOOK_HIDDEN_BY_DEFAULT;
  }
}

/** Retient le choix ; une mémoire refusée ne dérange personne. */
export function writeHiddenColumns(storage: Storage | null, hidden: readonly string[]): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(hidden));
  } catch {
    // Navigation privée ou quota : le choix vaut pour la session.
  }
}
