import type { CartLine } from './cart.store';
import type { DraftSnapshot } from './draft.store';

/** Un brouillon mis de côté : les lignes, et les décisions qui les accompagnent. */
export interface StoredDraft {
  readonly lines: readonly CartLine[];
  readonly draft: DraftSnapshot;
  /** Quand il a été mis de côté (ISO) — l'écran le dit en le reprenant. */
  readonly savedAt: string;
}

/**
 * Le brouillon **mis de côté**, dans le navigateur du commercial.
 *
 * ⚠️ **`localStorage`, donc une machine et un navigateur.** Un brouillon
 * enregistré au comptoir ne se retrouve pas sur le téléphone, et se perd avec le
 * profil. C'est assumé : ce qu'on garde ici est une saisie interrompue, pas un
 * engagement — un brouillon partagé serait un objet du domaine, avec un
 * propriétaire, une durée de vie et une route, et cela ne se décide pas dans un
 * écran.
 *
 * Une clé **par société** : deux comptes en cours de saisie ne s'écrasent pas.
 */
const PREFIX = 'lfc.admin.order-draft.';

function keyFor(companyId: string): string {
  return `${PREFIX}${companyId}`;
}

/** Le stockage, ou `null` — SSR, mode privé saturé, stockage refusé. */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(companyId: string, draft: Omit<StoredDraft, 'savedAt'>): boolean {
  const store = storage();
  if (store === null) {
    return false;
  }
  try {
    const stored: StoredDraft = { ...draft, savedAt: new Date().toISOString() };
    store.setItem(keyFor(companyId), JSON.stringify(stored));
    return true;
  } catch {
    // Quota plein ou écriture refusée : l'appelant le dira, plutôt que de
    // laisser croire que la saisie est à l'abri.
    return false;
  }
}

/**
 * Relit le brouillon de cette société. `null` si rien, ou si ce qui est stocké
 * n'a plus la forme attendue — un brouillon d'une version précédente vaut mieux
 * ignoré que restauré à moitié.
 */
export function loadDraft(companyId: string): StoredDraft | null {
  const store = storage();
  const raw = store?.getItem(keyFor(companyId)) ?? null;
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(companyId: string): void {
  storage()?.removeItem(keyFor(companyId));
}

/**
 * Le brouillon relu a-t-il la forme attendue ? On contrôle la **charpente** —
 * les deux objets et le tableau de lignes — et non chaque champ : les signaux
 * qui les reçoivent ont tous une valeur de repli, et un contrôle exhaustif ici
 * dupliquerait `DraftSnapshot` une seconde fois.
 */
function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<StoredDraft>;
  return (
    Array.isArray(candidate.lines) &&
    typeof candidate.draft === 'object' &&
    candidate.draft !== null &&
    typeof candidate.savedAt === 'string'
  );
}
