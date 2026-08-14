import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import type { CompanyIdentityView } from '../company-identity.view-model';

/**
 * Carte **Identité légale** d'une société — présentation pure.
 *
 * Affiche l'identité (raison sociale, forme, SIRET, TVA, statut, rôle) et le
 * bloc **KBIS** (fichier déposé ou zone de dépôt). Ne connaît ni service ni
 * modèle d'app : tout entre par `input()` (le view-model neutre + les capacités)
 * et sort par `output()` (les intentions). Le container de chaque app mappe son
 * modèle, calcule les capacités et exécute les actions.
 */
@Component({
  selector: 'lfd-company-identity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldIconComponent,
  ],
  templateUrl: './company-identity-card.html',
  styleUrl: './company-identity-card.scss',
})
export class CompanyIdentityCard {
  /** L'identité à afficher (view-model neutre). */
  readonly identity = input.required<CompanyIdentityView>();
  /** Le gestionnaire peut éditer l'identité souple (bouton Modifier + callout TVA). */
  readonly canManage = input(false);
  /** Le gestionnaire peut déposer / remplacer le KBIS. */
  readonly canManageKbis = input(false);
  /**
   * Les actions **Voir / Télécharger** du KBIS sont disponibles — vrai quand un
   * endpoint de récupération du fichier existe pour ce consommateur. Faux masque
   * les boutons tout en gardant la métadonnée (nom, date, badge certifié).
   */
  readonly canAccessKbis = input(true);
  /** Une action KBIS est en cours (dépôt) — désactive les contrôles. */
  readonly busy = input(false);
  /** Message d'erreur d'une action KBIS, ou `null`. */
  readonly error = input<string | null>(null);
  /** Texte de la zone de dépôt quand aucun KBIS n'est présent (formulation par app). */
  /**
   * Faut-il **rappeler** que le KBIS manque ?
   *
   * C'était un mode configurable (`hidden`/`optional`/`required`). Il n'y a
   * plus de configuration : la vérification de l'extrait est une convention
   * interne, jamais bloquante. Le rappel reste — on veut le document — mais il
   * a le ton de ce qu'il est : une information, pas un verrou.
   */
  readonly askForKbis = input(true);

  readonly kbisEmptyHint = input(
    "L'activation du compte passe par la réception de l'extrait KBIS (format PDF).",
  );

  /** L'utilisateur demande l'édition de l'identité souple. */
  readonly edit = output<void>();
  /** Un fichier KBIS a été choisi (à téléverser par le container). */
  readonly kbisSelected = output<File>();
  /** Demande d'ouverture du KBIS. */
  readonly viewKbis = output<void>();
  /** Demande de téléchargement du KBIS. */
  readonly downloadKbis = output<void>();

  /** Émet le fichier choisi puis réinitialise l'input (re-dépôt du même nom). */
  /**
   * Cet appareil a-t-il une caméra à portée ? Un pointeur **grossier** est le
   * signal honnête d'un téléphone ou d'une tablette.
   *
   * On ne montre pas « Prendre en photo » sur un poste fixe : le bouton y
   * ouvrirait le même sélecteur de fichiers que l'autre, et deux boutons pour
   * un geste, c'est deux façons de se tromper. Lu une fois, à la construction —
   * un commercial ne change pas d'appareil en cours de saisie — et gardé pour
   * le rendu serveur, où `matchMedia` n'existe pas.
   */
  protected readonly handheld = isHandheld();

  /** Ce qui manque à l'identité légale, en une phrase lisible. */
  protected readonly missingLegalLabel = computed(() => this.identity().missingLegal.join(', '));

  /**
   * L'avertissement de remplacement est-il ouvert ?
   *
   * Il ne s'affiche QUE pour un extrait déjà déposé — c'est là que remplacer a
   * une conséquence : la vérification tombe, et avec elle le régime mensuel.
   * Ouvrir le sélecteur de fichier d'abord et prévenir ensuite serait inutile :
   * une fois le fichier choisi, la certification est déjà perdue côté serveur.
   */
  protected readonly replacing = signal(false);

  protected askReplace(): void {
    this.replacing.set(true);
  }

  /** Le geste est assumé : on ouvre le sélecteur et on referme l'avertissement. */
  protected confirmReplace(input: HTMLInputElement): void {
    this.replacing.set(false);
    input.click();
  }

  protected onKbisSelected(event: Event): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (file !== undefined) {
      this.kbisSelected.emit(file);
    }
  }
}

/**
 * Sommes-nous sur un appareil qu'on tient en main ?
 *
 * `matchMedia` manque au rendu serveur comme à l'environnement de test : dans
 * le doute on répond **non**, et le bouton photo n'apparaît pas. Une capacité
 * qu'on ne peut pas constater ne se suppose pas.
 */
function isHandheld(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}
