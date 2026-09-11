import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { HandoverQueueEntryView, OrderLineView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldSurfaceDirective,
  type FoldCalloutVariant,
  type FoldIconName,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { HandoverQueueService } from '../handover-queue.service';
import { saveBlob } from '../../shared/download/save-blob';
import { formatWindow } from '../handover-queue';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Combien de lignes avant de replier. Cinq : de quoi reconnaître un sac d'un
 * coup d'œil sans que le bouton de remise sorte de l'écran.
 */
const SHOWN_LINES = 5;

const PLACED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * **Ce qu'on tend à cette personne** — le rail de droite de la file.
 *
 * ## Un rail permanent, et non un panneau qui s'ouvre
 *
 * 🔴 C'était un `fold-panel-host` jusqu'au 2026-09-11 : un overlay modal, qui
 * `inert`ait la file derrière lui. Sur un écran de comptoir c'est le mauvais
 * geste — on lit la file ET le sac en même temps, on passe de l'une à l'autre
 * sans fermer quoi que ce soit, et une modale interdit précisément cela. Un
 * rail toujours là, vide quand rien n'est choisi, ne prend rien à personne : la
 * place, elle, est disponible.
 *
 * ## Pourquoi il charge la commande alors que la file est déjà là
 *
 * Parce que la file ne porte AUCUNE ligne de marchandise, et c'est le sens de
 * sa séparation d'avec la vue détaillée : charger le détail de quarante
 * commandes pour n'en ouvrir qu'une est exactement le coût que le contrat
 * évite. Le rail paie donc une lecture, au clic, pour une seule commande.
 *
 * ## Ce qu'il atteste, et comment il le dit
 *
 * 🔴 **Il atteste une remise SAISIE, jamais un scan.** Le scan
 * (`/retrait/:token`) prouve la présence ; un clic non. Le serveur porte donc
 * deux verbes, et celui-ci grave `manual` — une attestation **faible et
 * honnête**. Le bouton l'écrit en toutes lettres : « Remettre sans code ».
 *
 * ⚠️ Le JSDoc disait « il n'atteste aucune remise » jusqu'au 2026-09-11.
 * Refuser le geste ne le supprimait pas : il renvoyait le cas de tous les
 * matins — un client sans téléphone — vers un contournement que rien ne trace.
 */
@Component({
  selector: 'app-remise-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    // 🔴 La directive, pas seulement l'attribut : sans elle `foldSurface` est
    // du HTML inerte, le fond sombre est peint et l'encre reste sombre.
    FoldSurfaceDirective,
  ],
  templateUrl: './remise-detail.html',
  styleUrl: './remise-detail.scss',
})
export class RemiseDetail {
  /** La ligne choisie dans la file, ou `null` — le rail existe dans les deux cas. */
  readonly entry = input<HandoverQueueEntryView | null>(null);

  /**
   * Un sac est parti par ici. La file se relit chez son appelant : le serveur
   * arbitre la course entre deux comptoirs, et lui seul sait qui a gagné.
   */
  readonly remitted = output<void>();

  /** L'équipe referme le rail. La file reste, et rien n'est sélectionné. */
  readonly cleared = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly handovers = inject(HandoverQueueService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('idle');
  protected readonly lines = signal<readonly OrderLineView[]>([]);
  protected readonly busy = signal(false);
  protected readonly remitting = signal(false);

  /**
   * La liste est-elle dépliée ?
   *
   * 🔴 Repliée par défaut au-delà de {@link SHOWN_LINES}. Un sac de vingt
   * références pousserait le bouton de remise hors de l'écran — celui qu'on
   * cherche justement en tenant le sac. Ce qui reste est **compté**, jamais
   * caché en silence : une liste tronquée sans le dire fait tendre un sac
   * incomplet.
   */
  private readonly expanded = signal(false);

  /** Les lignes montrées — les premières, puis toutes une fois dépliées. */
  protected readonly shownLines = computed<readonly OrderLineView[]>(() => {
    const lines = this.lines();
    return this.expanded() ? lines : lines.slice(0, SHOWN_LINES);
  });

  /** Ce que la troncature retient, en références ET en pièces. Ou `null`. */
  protected readonly hiddenLines = computed<{
    readonly references: number;
    readonly units: number;
  } | null>(() => {
    const rest = this.lines().slice(this.shownLines().length);
    if (rest.length === 0) {
      return null;
    }
    return {
      references: rest.length,
      units: rest.reduce((sum, line) => sum + line.quantity, 0),
    };
  });

  /**
   * Le sur-titre : **où** et **quand**, les deux faits qui tranchent « est-ce
   * bien celle-là » avant même qu'on lise le numéro.
   */
  protected readonly contextLine = computed<string>(() => {
    const entry = this.entry();
    if (entry === null) {
      return '';
    }
    const where = entry.pickupLabel ?? this.methodLabel();
    const slot = formatWindow(entry.window);
    // 🔴 L'absence se DIT. Ne montrer que le point laisserait croire qu'aucune
    // heure n'a été convenue faute de place à l'écran, alors que c'est un fait
    // de la commande — et c'est le cas de masse depuis le backfill du
    // 2026-08-15.
    return slot === null ? `${where} · aucune tranche demandée` : `${where} · ${slot}`;
  });

  /** Le créneau écrit, ou `null` — aucune heure n'est inventée ici non plus. */
  protected readonly window = computed<string | null>(() => {
    const entry = this.entry();
    return entry === null ? null : formatWindow(entry.window);
  });

  /** « Retrait » ou « Livraison » — le mot qui précède l'heure convenue. */
  protected readonly methodLabel = computed<string>(() => {
    const entry = this.entry();
    if (entry === null) {
      return '';
    }
    return entry.fulfillmentMethod === 'delivery' ? 'Livraison' : 'Retrait';
  });

  /**
   * Le verdict du fournil, **et rien de plus que ce qu'il a dit**.
   *
   * 🔴 Pas de « et complète » : il n'existe ni rupture ni avoir dans le modèle,
   * donc personne n'a vérifié qu'elle l'était. Une phrase rassurante fausse est
   * pire qu'une absence sur un écran qu'on lit avec quelqu'un en face.
   */
  protected readonly readyText = computed<string>(() => {
    const entry = this.entry();
    if (entry === null) {
      return '';
    }
    if (entry.state === 'handed_over') {
      return 'Déjà remise. Le sac est parti.';
    }
    return entry.readyAt === null
      ? 'Pas encore déclarée prête par le fournil.'
      : 'Déclarée prête par le fournil.';
  });

  protected readonly readyTone = computed<FoldCalloutVariant>(() => {
    const entry = this.entry();
    if (entry === null) {
      return 'neutral';
    }
    return entry.readyAt === null && entry.state !== 'handed_over' ? 'warning' : 'success';
  });

  protected readonly readyIcon = computed<FoldIconName>(() => {
    const entry = this.entry();
    return entry !== null && entry.readyAt === null && entry.state !== 'handed_over'
      ? 'clock'
      : 'check';
  });

  /** Peut-on encore tendre ce sac ? Même règle que le serveur, dite pour l'œil. */
  protected readonly remittable = computed<boolean>(() => {
    const entry = this.entry();
    return entry !== null && entry.state !== 'handed_over' && entry.state !== 'cancelled';
  });

  protected readonly placedAt = computed<string>(() => {
    const entry = this.entry();
    return entry === null ? '' : PLACED_AT.format(new Date(entry.placedAt));
  });

  constructor() {
    // Le rail suit la sélection : une ligne choisie charge son contenu, aucune
    // sélection le rend à son état vide — sans garder les articles du sac
    // précédent à l'écran, ce qui est la façon la plus simple de tendre le
    // mauvais.
    effect(() => {
      const entry = this.entry();
      if (entry === null) {
        this.lines.set([]);
        this.state.set('idle');
        return;
      }
      this.expanded.set(false);
      void this.load();
    });
  }

  protected showAll(): void {
    this.expanded.set(true);
  }

  protected clear(): void {
    this.cleared.emit();
  }

  protected async load(): Promise<void> {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    this.state.set('loading');
    try {
      const order = await this.api.byId(entry.orderId);
      this.lines.set(order.lines);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Le bon de commande, tel que le client l'a. Le même document sous la même
   * clé d'archive — c'est ce qui permet d'en discuter au comptoir.
   */
  protected async download(): Promise<void> {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    this.busy.set(true);
    try {
      const pdf = await this.api.sheetPdf(entry.orderId);
      saveBlob(pdf, `bon-de-commande-${entry.reference}.pdf`);
    } catch (caught) {
      this.notify.error(caught, "Le bon de commande n'a pas pu être téléchargé.");
    } finally {
      this.busy.set(false);
    }
  }

  /** **La remise saisie**, depuis le rail — le chemin sans QR. */
  protected async remit(): Promise<void> {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    this.remitting.set(true);
    try {
      await this.handovers.confirmManually(entry.reference);
      this.remitted.emit();
    } catch (caught) {
      this.notify.error(caught, "Cette remise n'a pas pu être enregistrée.");
    } finally {
      this.remitting.set(false);
    }
  }
}
