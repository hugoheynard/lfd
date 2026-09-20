import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** La clé sous laquelle tout tient — une seule, pour pouvoir tout jeter d'un geste. */
const STORAGE_KEY = 'lfc.admin.ui-prefs';

/**
 * Les préférences d'AFFICHAGE d'un écran : ce qui est replié, ce qui est
 * déployé. Un sac de booléens par espace de noms, gardé dans le navigateur.
 *
 * **Pourquoi ici et pas dans `nav_prefs`** — le sac serveur existe (il porte la
 * vue du catalogue), mais il porte des préférences d'un autre genre : une valeur,
 * changée rarement, qui gagne à suivre la personne d'une machine à l'autre.
 * Ce sac-ci change à chaque clic sur un chevron, ne vaut rien perdu (le coût est
 * un clic), et se veut sans doute DIFFÉRENT selon l'écran — on ne replie pas les
 * mêmes sections sur un portable et sur un 27 pouces. Le passer par le réseau
 * coûterait une requête par pli et une migration sur une base en service, pour
 * une donnée dont l'oubli ne fait mal à personne.
 *
 * Le jour où l'on veut vraiment qu'une préférence suive la personne, c'est une
 * colonne sur `staff_users` et un `PATCH /admin/me/prefs` — pas ce fichier.
 *
 * Tolérant à la panne, et délibérément : un stockage refusé (navigation privée,
 * quota, politique d'entreprise) rend l'écran à son état par défaut. Une
 * préférence d'affichage ne doit jamais casser une page.
 */
@Injectable({ providedIn: 'root' })
export class UiPrefsStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** L'état replié/déployé d'une clé ; `fallback` quand rien n'a été choisi. */
  isOpen(scope: string, key: string, fallback: boolean): boolean {
    const stored = this.read()[`${scope}.${key}`];
    return typeof stored === 'boolean' ? stored : fallback;
  }

  /** Enregistre un choix. Silencieux : l'écran a déjà bougé, on ne le dérange pas. */
  setOpen(scope: string, key: string, open: boolean): void {
    this.write({ ...this.read(), [`${scope}.${key}`]: open });
  }

  private read(): Record<string, unknown> {
    if (!this.isBrowser) {
      return {};
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return {};
      }
      const parsed: unknown = JSON.parse(raw);
      // Un sac illisible (version d'avant, édition à la main) vaut un sac vide :
      // on repart des défauts plutôt que de propager une forme inconnue.
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private write(bag: Record<string, unknown>): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bag));
    } catch {
      // Quota plein ou stockage refusé : la session garde son état, la prochaine
      // repartira des défauts. Rien à dire à l'utilisateur.
    }
  }
}
