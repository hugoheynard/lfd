import { Injectable, signal, type Signal } from '@angular/core';

/**
 * Les **comptes épinglés** du tableau de bord — les clients qu'un commercial
 * veut garder sous les yeux.
 *
 * **Stockés dans le navigateur, pas sur le serveur**, et c'est un choix daté :
 * une préférence par personne suppose une personne, or le login staff n'est pas
 * branché (tout le monde est `dev-staff` derrière le bypass). Persister
 * aujourd'hui côté serveur reviendrait à écrire les épingles de tout le monde
 * dans la même ligne.
 *
 * Le jour où l'identité staff existe, ce magasin devient un adaptateur : même
 * API (`pinned`, `toggle`, `isPinned`), une écriture réseau derrière. C'est pour
 * ça que la page ne touche jamais `localStorage` elle-même.
 *
 * SSR : `localStorage` n'existe pas côté serveur. On lit **paresseusement**, au
 * premier accès dans le navigateur, et on n'écrit jamais sans l'avoir vérifié.
 */

const STORAGE_KEY = 'lfc.admin.cockpit.pinned';
/** Au-delà, ce n'est plus un épinglage mais une seconde liste de comptes. */
export const MAX_PINNED = 6;

@Injectable({ providedIn: 'root' })
export class PinnedAccountsStore {
  private readonly ids = signal<readonly string[]>(read());

  /** Les identifiants épinglés, dans l'ordre où ils ont été posés. */
  get pinned(): Signal<readonly string[]> {
    return this.ids.asReadonly();
  }

  isPinned(companyId: string): boolean {
    return this.ids().includes(companyId);
  }

  /**
   * Épingle ou retire. Rend `false` quand la limite est atteinte — l'appelant
   * peut alors le dire, plutôt que de voir son clic ignoré sans explication.
   */
  toggle(companyId: string): boolean {
    const current = this.ids();
    if (current.includes(companyId)) {
      this.write(current.filter((id) => id !== companyId));
      return true;
    }
    if (current.length >= MAX_PINNED) {
      return false;
    }
    this.write([...current, companyId]);
    return true;
  }

  private write(next: readonly string[]): void {
    this.ids.set(next);
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota plein ou stockage refusé : l'épinglage reste vrai pour la session.
    }
  }
}

/** Lit ce qui est stocké, en se méfiant : un JSON étranger ne doit rien casser. */
function read(): readonly string[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_PINNED)
      : [];
  } catch {
    return [];
  }
}
