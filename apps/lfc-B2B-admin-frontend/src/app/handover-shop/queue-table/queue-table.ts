import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { HandoverQueueEntryView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  type FoldBadgeVariant,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';

import {
  clockOf,
  formatHour,
  formatWindow,
  isLate,
  lateLabel,
  lateMinutes,
  matchingQueue,
  rowTone,
  sortedQueue,
  stateLabel,
  stateVariant,
} from '../handover-queue';

/**
 * **La file, dessinée** — les lignes du comptoir et rien d'autre.
 *
 * ## Ce qu'elle ne sait pas
 *
 * 🔴 Elle ne charge rien, n'appelle aucun service, ne connaît ni la journée
 * choisie ni les onglets. Elle reçoit des lignes et **émet des intentions** :
 * ouvrir, scanner, rappeler. C'est ce qui la rend éprouvable sans HTTP ni
 * panneau — on lui passe six lignes et on lit ce qu'elle rend.
 *
 * L'écran, lui, garde ce qui demande le monde extérieur : la lecture, les
 * onglets, l'horloge, les panneaux, le rail. La frontière est celle-là et pas
 * une autre — ce qui se **peint** d'un côté, ce qui **décide** de l'autre.
 *
 * ## L'ordre est ici, avec ce qu'il ordonne
 *
 * `sortedQueue` vit dans cette classe et pas chez l'appelant : l'ordre de la
 * file — par créneau, puis par heure de commande — est une propriété de la file,
 * pas une préparation que le porteur doit penser à faire. Un appelant qui
 * oublierait de trier obtiendrait une liste juste et illisible.
 *
 * ## Les deux règles qu'elle tient
 *
 * 🔴 **Aucune heure inventée.** Une commande sans créneau demandé le dit et
 * descend en fin de file — lui en prêter une la rangerait au mauvais endroit.
 *
 * 🔴 **Le retard est une NOTE, pas un tiroir.** Il est là sans qu'on clique :
 * un avertissement qu'il faut déplier n'alerte personne.
 */
@Component({
  selector: 'app-queue-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowNoteDirective,
  ],
  templateUrl: './queue-table.html',
  styleUrl: './queue-table.scss',
})
export class QueueTable {
  /** Les lignes à peindre — déjà filtrées par onglet, pas encore ordonnées. */
  readonly entries = input.required<readonly HandoverQueueEntryView[]>();

  /** Le jour de service : un créneau ne porte qu'une heure, et l'heure seule ne
   *  se compare à rien. */
  readonly day = input.required<string>();

  /**
   * L'instant qui sert à juger un retard, **reçu et non lu**.
   *
   * 🔴 Une entrée plutôt qu'un `new Date()` au rendu : l'horloge du comptoir bat
   * chez l'écran, et la lire ici ferait dépendre l'affichage du moment où
   * Angular repeint — donc un test ne pourrait plus poser l'heure qu'il veut.
   */
  readonly now = input.required<Date>();

  /** La commande dont le rappel est en vol — au plus une, et le bouton le dit. */
  readonly busyId = input<string | null>(null);

  /** Les rappels déjà partis, pour ne pas les réarmer à l'identique. */
  readonly reminded = input<ReadonlySet<string>>(new Set());

  /**
   * Le terme cherché, ou `''` — un **filtre de ce qui est affiché**, jamais une
   * requête.
   *
   * 🔴 Il vit ici et non chez l'appelant, pour la raison qui a déjà fait
   * descendre le tri : la page dérive ses compteurs de la journée entière — « 6
   * en attente, 3 en retard ». Filtrer en amont les ferait mentir au premier
   * caractère tapé, et un comptoir qui lit « 1 en retard » parce qu'on cherche
   * un nom prend une décision sur un chiffre faux.
   */
  readonly query = input<string>('');

  /** On a touché la ligne : elle s'ouvre dans le rail. */
  readonly opened = output<HandoverQueueEntryView>();

  /** On renvoie le courriel de retrait à ce client. */
  readonly reminder = output<HandoverQueueEntryView>();

  /**
   * La file : ordonnée d'abord, filtrée ensuite.
   *
   * L'ordre avant le filtre, et l'inverse serait un piège : le tri est stable
   * par créneau puis par heure de commande, donc filtrer d'abord donnerait le
   * même résultat — aujourd'hui. Le jour où le tri regarde le rang d'une ligne
   * dans la file, il le regarderait dans une file amputée.
   */
  protected readonly rows = computed<readonly HandoverQueueEntryView[]>(() =>
    matchingQueue(sortedQueue(this.entries()), this.query()),
  );

  protected readonly columns: readonly FoldTableColumn<HandoverQueueEntryView>[] = [
    // Le créneau en tête : c'est l'ordre de la file, et donc l'ordre dans
    // lequel on la parcourt des yeux au comptoir.
    { key: 'window', label: 'Créneau', width: '8rem' },
    { key: 'customer', label: 'Client' },
    // 🔴 La référence A sa colonne depuis le 2026-09-11. Elle vivait sous le
    // nom du client, et l'argument tenait tant que la file était serrée : une
    // colonne pour un identifiant qu'on ne trie ni ne compare prenait la place
    // du seul champ qu'on cherche. Le scan par ligne est parti avec ses 8,5 rem
    // — la place existe —, et une référence alignée en colonne se compare d'un
    // coup d'œil avec l'écran d'un client, ce qu'une ligne d'appoint sous un
    // nom de longueur variable ne permet pas.
    { key: 'reference', label: 'Commande', width: '10rem' },
    { key: 'units', label: 'Pièces', numeric: true, width: '5.5rem' },
    { key: 'state', label: 'État', width: '8rem' },
  ];

  /**
   * Ce que dit la table quand le terme ne laisse rien.
   *
   * ⚠️ Elle ne dit PAS « aucune commande » : la journée en a, c'est le filtre
   * qui les cache. Confondre les deux ferait chercher un bug de lecture là où
   * il suffit de vider la boîte — et la page a son propre vide, pour le vrai.
   */
  protected readonly nothingFound: FoldTableEmpty = {
    title: 'Aucune ligne ne correspond',
    subtitle: 'Videz la recherche pour retrouver toute la file du jour.',
  };

  protected readonly rowKey = (entry: HandoverQueueEntryView): string => entry.orderId;

  protected readonly toneOf = (entry: HandoverQueueEntryView): FoldTableTone =>
    rowTone(entry, this.day(), this.now());

  /**
   * **Quelles lignes portent une note.** L'autre moitié du câblage : le gabarit
   * dit à quoi une note ressemble, ceci dit qui en a une.
   *
   * 🔴 Une propriété-flèche et non une méthode : `fold-data-table` la reçoit
   * comme une entrée, donc elle doit garder son `this`. Une méthode passée par
   * référence perdrait le composant et lèverait au premier rendu.
   */
  protected readonly hasNote = (entry: HandoverQueueEntryView): boolean => this.late(entry);

  // Le contexte d'un `foldCell` n'est pas typé (`let-row` est `any`) : on entre
  // par des méthodes, qui rendent la ligne typée au passage.
  protected windowLabel(entry: HandoverQueueEntryView): string | null {
    return formatWindow(entry.window);
  }

  protected late(entry: HandoverQueueEntryView): boolean {
    return isLate(entry, this.day(), this.now());
  }

  /** « 56 min de retard », ou `null`. */
  protected lateText(entry: HandoverQueueEntryView): string | null {
    const minutes = lateMinutes(entry, this.day(), this.now());
    return minutes === null ? null : lateLabel(minutes);
  }

  /** « remise 6 h 41 » — l'heure sous le nom, à la place de la référence. */
  protected handedOverAt(entry: HandoverQueueEntryView): string | null {
    if (entry.handedOverAt === null) {
      return null;
    }
    return `remise ${formatHour(clockOf(new Date(entry.handedOverAt)))}`;
  }

  protected label(entry: HandoverQueueEntryView): string {
    return stateLabel(entry.state);
  }

  protected variant(entry: HandoverQueueEntryView): FoldBadgeVariant {
    return stateVariant(entry.state);
  }

  /** Peut-on encore tendre ce sac ? Même règle que le serveur, dite pour l'œil. */
  protected remittable(entry: HandoverQueueEntryView): boolean {
    return entry.state !== 'handed_over' && entry.state !== 'cancelled';
  }

  /**
   * Le rappel n'a de sens que sur une commande **déclarée prête**. Le serveur le
   * refuse aussi — la règle vit là-bas ; ici on évite d'armer un bouton dont on
   * connaît déjà la réponse.
   */
  protected remindable(entry: HandoverQueueEntryView): boolean {
    return this.remittable(entry) && entry.readyAt !== null && !this.reminderSent(entry);
  }

  protected reminderSent(entry: HandoverQueueEntryView): boolean {
    return this.reminded().has(entry.orderId);
  }

  protected busy(entry: HandoverQueueEntryView): boolean {
    return this.busyId() === entry.orderId;
  }
}
