import { ChangeDetectionStrategy, Component, Injector, computed, inject } from '@angular/core';
import {
  FoldButtonComponent,
  FoldPanelHostService,
  FoldSurfaceDirective,
  FoldViewNavComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NewOrderDialog } from '../../commandes/new-order-dialog/new-order-dialog';
import { HandoverMasthead } from '../../handover-shop/handover-masthead/handover-masthead';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { NewOrderFab } from '../../shared/new-order-fab/new-order-fab';

/**
 * **La bande de tête du comptoir**, présente sur ses vues (Hugo,
 * 2026-10-12 : « le masthead devrait rester présent sur toutes les pages »).
 *
 * Elle porte d'abord les **onglets du comptoir** — Retrait, Réassort —, lus
 * dans `COMPTOIR_VIEWS` et donc filtrés par les droits
 * comme les tuiles du lanceur, et le bouton « Nouvelle commande », qui ouvre
 * le même dialogue que la liste des commandes. Puis, pour qui tient le
 * retrait, la part du retrait (`app-handover-masthead`) : point ouvert,
 * compteurs, heure, journée.
 *
 * 🔴 **Sans `handover_counter:read`, la bande ne porte que les onglets.** La
 * part du retrait est la seule à injecter `HandoverQueueStore` : ne pas la
 * monter, c'est ne jamais appeler l'API du retrait — et ne pas se prendre un
 * 403 sur un poste qui ne tient que la commande pro.
 *
 * Sur le chrome, et à la taille d'une tablette : cibles de 48 px et texte de
 * corps plein, parce que le comptoir se sert au doigt.
 */
/**
 * Les onglets qui nomment le point ouvert, par leur clé dans `COMPTOIR_VIEWS` :
 * « Réassort Labo » (Hugo, 2026-10-21), « Retrait commande Labo » (Hugo,
 * 2026-11-03). Sans point ouvert, le nom seul.
 */
const SITED_LABELS: Readonly<Record<string, string>> = {
  retrait: 'Retrait commande',
  reassort: 'Réassort',
};

/**
 * Au téléphone, un mot par onglet (Hugo, 2026-11-28) : le point ouvert est
 * déjà nommé juste au-dessus, et « Retrait commande Le Labo » se coupait.
 */
const SHORT_LABELS: Readonly<Record<string, string>> = {
  retrait: 'Retrait',
  reassort: 'Réassort',
};

@Component({
  selector: 'app-comptoir-masthead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NewOrderFab,
    FoldButtonComponent,
    FoldViewNavComponent,
    // 🔴 La directive, et pas seulement l'attribut : sans elle
    // `foldSurface="chrome"` est du HTML inerte qu'Angular ignore, et la
    // polarité n'est jamais basculée — invisible au typecheck comme à l'AOT.
    FoldSurfaceDirective,
    HandoverMasthead,
  ],
  templateUrl: './comptoir-masthead.html',
  styleUrl: './comptoir-masthead.scss',
})
export class ComptoirMasthead {
  private readonly permissions = inject(PermissionsStore);

  private readonly injector = inject(Injector);
  private readonly permitted = inject(WorkspaceCatalogue).views('comptoir');

  /**
   * Les onglets permis, dans l'ordre de `COMPTOIR_VIEWS` — le retrait et le
   * réassort nomment le point ouvert (`SITED_LABELS`).
   *
   * ⚠️ La file est lue par l'injecteur, et seulement pour qui tient le
   * retrait : un `inject` de champ l'instancierait pour tout poste, et
   * ramènerait le 403 que la bande évite (cf. plus haut).
   */
  protected readonly views = computed(() => {
    const views = this.permitted();
    const place = this.holdsCounter() ? this.injector.get(HandoverQueueStore).activePlace() : null;
    if (this.narrow()) {
      return views.map((view) => ({ ...view, label: SHORT_LABELS[view.key] ?? view.label }));
    }
    return views.map((view) => {
      const base = SITED_LABELS[view.key];
      if (base === undefined) {
        return view;
      }
      return { ...view, label: place === null ? base : `${base} ${place.label}` };
    });
  });

  private readonly panels = inject(FoldPanelHostService);

  /**
   * Au téléphone, « Nouvelle commande » flotte en bas à droite, comme sur la
   * liste des commandes (Hugo, 2026-11-28) : le bandeau garde sa place.
   */
  protected readonly narrow = narrowViewport();

  /** Saisir une commande demande la caisse et la passation, comme la page de la saisie. */
  protected readonly canPlace = computed(
    () => this.permissions.can('b2b_counter:read') && this.permissions.can('b2b_place_order:write'),
  );

  /**
   * Le choix pro ou particulier, en dialogue centré. Il emporte l'origine et le
   * point ouvert : la saisie propose le « Retrait immédiat » sur ce point, et
   * « Terminer » ramène au comptoir.
   */
  protected openNewOrder(): void {
    const point = this.activePoint();
    this.panels.open(NewOrderDialog, {
      side: 'center',
      width: 'sm',
      data: { origin: '/comptoir', point },
    });
  }

  /** Le point de retrait ouvert, que la saisie propose en « Retrait immédiat ». */
  protected activePoint(): string | null {
    return this.holdsCounter()
      ? (this.injector.get(HandoverQueueStore).activePlace()?.id ?? null)
      : null;
  }

  /** Monte-t-on la part du retrait — et donc la file ? */
  protected readonly holdsCounter = computed(() => this.permissions.can('handover_counter:read'));
}
