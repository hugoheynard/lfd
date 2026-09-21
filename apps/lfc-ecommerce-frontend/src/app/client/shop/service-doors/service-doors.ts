import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { DoorCopy } from '../../copy/screens/accueil-public.copy';

/**
 * **Les deux portes d'un pro** — « je passe la prendre » et « on vous
 * l'apporte », côte à côte, à la place du bandeau de retrait.
 *
 * 🔴 ELLES N'EXISTENT QUE POUR UN PRO, et la raison n'est pas commerciale :
 * un compte perso n'a qu'un mode de service, donc rien à arbitrer. Lui montrer
 * deux portes dont une est fermée ferait arriver le refus après l'effort.
 *
 * 🔴 UN COMPOSANT, ET PAS UN BLOC DE PLUS DANS L'ACCUEIL. Ce n'est pas une
 * préférence de rangement : la feuille de styles de `accueil-public` a un
 * BUDGET DE 10 kB, et c'est une ERREUR — pas un avertissement — dans la
 * configuration par laquelle la boutique se déploie. Les portes l'ont fait
 * franchir de 2,3 kB à la première écriture. Un composant a son propre budget ;
 * l'écran garde le sien.
 *
 * La copie ARRIVE PAR ENTRÉE plutôt que d'être relue ici : les portes ne
 * connaissent pas l'écran qui les monte, et le jour où la boutique les
 * affichera aussi, elle n'aura rien à déplacer.
 */
@Component({
  selector: 'app-service-doors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './service-doors.html',
  styleUrl: './service-doors.scss',
})
export class ServiceDoors {
  readonly pickupCopy = input.required<DoorCopy>();
  readonly courierCopy = input.required<DoorCopy>();

  /**
   * 🔴 LA PORTE DU COURSIER EST TOUJOURS LÀ POUR UN PRO — ouverte ou EN ATTENTE
   * (Hugo, 2026-09-20 : « compte pro toujours 2 cartes, validé ou pas,
   * seulement la carte livraison aura mode en attente »).
   *
   * Elle a d'abord été conditionnée à la livraison réellement offerte, et la
   * règle avait deux défauts. Le premier est pour le client : un pro dont le
   * dossier est en cours voyait une page AMPUTÉE sans savoir qu'il lui manquait
   * quelque chose — un refus muet renvoie chercher la raison ailleurs, alors
   * qu'une porte en attente dit ce qu'on attend et qui l'ouvre.
   *
   * Le second est pour nous : la mise en page d'un pro dépendait d'un statut de
   * validation, donc elle n'était pas observable sans un compte validé. Elle
   * l'est maintenant dès qu'il y a une société.
   *
   * ⚠️ Entrée et non déduction : c'est l'écran qui sait où en est le dossier.
   * Les portes ne dessinent que ce qu'on leur donne.
   */
  readonly courierState = input.required<'open' | 'pending'>();

  readonly pickupChosen = output<void>();
  readonly courierChosen = output<void>();
}
