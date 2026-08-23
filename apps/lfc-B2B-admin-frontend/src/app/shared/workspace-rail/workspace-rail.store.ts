import { DestroyRef, Injectable, effect, inject, signal, type Signal } from '@angular/core';
import type { FoldIconName } from 'fold-ng';

/** Une vue d'espace de travail : une entrée du rail secondaire. */
export interface WorkspaceRailItem {
  readonly key: string;
  readonly label: string;
  /** Chemin **absolu** — le rail est rendu par la racine, pas par la page. */
  readonly link: string;
  readonly icon: FoldIconName;
}

/** Ce qu'un espace de travail publie : son nom et ses vues. */
export interface WorkspaceRail {
  /** Le nom de l'espace, en tête du rail — et son repère `nav`. */
  readonly title: string;
  readonly icon: FoldIconName;
  readonly items: readonly WorkspaceRailItem[];
}

/**
 * Le **rail d'espace de travail** — le deuxième rail de la coquille.
 *
 * fold range la navigation en trois étages : l'application (le rail primaire),
 * l'espace de travail (ce rail-ci), puis les vues d'une page. Le PIM occupait
 * le troisième alors qu'il est du deuxième : c'est un contexte borné entier —
 * son propre vocabulaire, ses sept vues, sa donnée — et le rendre comme une
 * barre d'onglets dans une page le disait plus petit qu'il n'est.
 *
 * Pourquoi un store et pas un `@if (url.startsWith('/pim'))` dans la racine :
 * la racine n'a pas à connaître les vues du PIM, et l'espace qui les possède
 * sait, lui, quand il s'en va. Publier à l'entrée et effacer à la sortie est
 * porté par le cycle de vie du composant, pas par une lecture d'URL qu'il
 * faudrait tenir à jour à chaque route ajoutée.
 *
 * Un seul espace à la fois : le dernier qui publie gagne, et il n'y a jamais
 * deux pages d'espace montées ensemble.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceRailStore {
  private readonly state = signal<WorkspaceRail | null>(null);

  /** L'espace de travail courant, ou `null` — le rail se replie alors seul. */
  readonly rail: Signal<WorkspaceRail | null> = this.state.asReadonly();

  set(rail: WorkspaceRail | null): void {
    this.state.set(rail);
  }
}

/**
 * Publier le rail de cet espace tant que le composant vit.
 *
 * À appeler depuis un contexte d'injection (le constructeur d'une page). Le
 * rail suit le signal — les droits peuvent en retirer une vue en cours de
 * route — et s'efface à la destruction : quitter l'espace ne laisse pas son
 * rail derrière soi.
 */
export function provideWorkspaceRail(rail: Signal<WorkspaceRail>): void {
  const store = inject(WorkspaceRailStore);
  effect(() => store.set(rail()));
  inject(DestroyRef).onDestroy(() => store.set(null));
}
