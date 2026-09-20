import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldIconComponent } from 'fold-ng';

import type { ActivationTrace, SuspensionCause } from '../../comptes-clients/admin-company';
import type { CompanyStatus } from '@lfd/contracts';

/**
 * Carte **cycle de vie du compte** du rail droit de la fiche staff.
 *
 * Pendant du rail « assistance commerciale » côté client : chaque camp a, au
 * même endroit, le geste qui fait avancer le dossier. Le client demande de
 * l'aide ; le commercial, lui, ouvre — ou rend — l'accès.
 *
 * Ce bouton vivait au fil de la fiche, entre deux sections, et se perdait dès
 * que le dossier s'allongeait — or c'est **le** geste qui clôt l'affaire. Épinglé
 * à droite, il reste visible pendant qu'on complète les pièces, et il dit
 * pourquoi il refuse : un bouton grisé muet est une impasse.
 *
 * La carte suit les **quatre** états, pas deux. Elle en connaissait deux
 * (« en attente » / « actif ») et affichait donc « Compte actif » à un compte
 * suspendu : l'écran affirmait le contraire du badge d'en-tête, et rien
 * n'offrait de rendre l'accès.
 *
 * Composant de présentation — il ne décide rien. La fiche calcule ce qui bloque
 * (le même verdict que le serveur) ; ici on ne fait que le dire.
 */
@Component({
  selector: 'app-activation-aside',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent, FoldIconComponent],
  templateUrl: './activation-aside.html',
  styleUrl: './activation-aside.scss',
})
export class ActivationAside {
  /** Où en est le compte. Les quatre états ont chacun leur mot à dire. */
  readonly status = input.required<CompanyStatus>();
  /** Le serveur accepterait-il d'activer maintenant ? */
  readonly canActivate = input.required<boolean>();
  /** Ce qui bloque, en une phrase ; vide quand rien ne bloque. */
  readonly blockedReason = input('');
  /**
   * Combien d'**empêchements** le serveur oppose — pas combien de lignes sont
   * affichées. Il comptait les étapes de la liste, condition de règlement
   * comprise : il n'atteignait donc jamais zéro, et annonçait « 1 pièce
   * manquante » devant un dossier dont seul le téléphone manquait.
   */
  readonly remaining = input(0);
  /** Qui a ouvert le compte, et quand — `null` tant qu'il ne l'a jamais été. */
  readonly activation = input<ActivationTrace | null>(null);
  /** Ce qui a coupé l'accès : c'est ce qui décide du geste à proposer. */
  readonly suspensionCause = input<SuspensionCause | null>(null);

  readonly activate = output<void>();
  readonly reactivate = output<void>();

  protected readonly pending = computed(() => this.status() === 'pending');
  protected readonly suspended = computed(() => this.status() === 'suspended');
  protected readonly terminated = computed(() => this.status() === 'terminated');

  /**
   * La suspension se lève-t-elle **d'elle-même** ? Celle qu'a provoquée le
   * retrait de vérification du KBIS se relève à la re-vérification ; proposer
   * « Réactiver » ici laisserait croire qu'il existe deux chemins, dont un qui
   * contournerait la vérification.
   */
  protected readonly liftsByItself = computed(() => this.suspensionCause() === 'kbis_revoked');

  /**
   * « 3 points à régler » — le décompte fait plus pression qu'une liste. « Pièce »
   * serait faux : un numéro de téléphone manquant n'est pas une pièce du dossier.
   */
  protected readonly remainingLabel = computed(() => {
    const count = this.remaining();
    return count === 1 ? '1 point à régler' : `${count} points à régler`;
  });

  /**
   * « Ouvert par Camille Rousseau (commercial), le 12/08/2026 » — ou la date
   * seule, ou rien.
   *
   * Une trace incomplète vaut mieux qu'une trace inventée : quand l'annuaire ne
   * connaissait pas l'agent, on ne colle pas son identifiant technique au milieu
   * d'une phrase. Le `sub` reste en base pour qui enquête.
   */
  protected readonly activationLabel = computed(() => {
    const trace = this.activation();
    if (trace === null) {
      return '';
    }
    const date = new Date(trace.at).toLocaleDateString('fr-FR');
    const name = trace.by?.name ?? '';
    if (name === '') {
      return `Ouvert le ${date}.`;
    }
    const role = trace.by?.role ?? '';
    const who = role === '' ? name : `${name} (${role})`;
    return `Ouvert par ${who}, le ${date}.`;
  });
}
