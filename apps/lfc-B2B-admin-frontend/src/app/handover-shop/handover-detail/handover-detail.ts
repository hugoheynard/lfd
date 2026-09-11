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
import type { HandoverQueueEntryView, OrderHandoverLine, OrderHandoverView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  FoldSurfaceDirective,
  type FoldCalloutVariant,
  type FoldIconName,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { HandoverQueueService } from '../handover-queue.service';
import { SheetPanel, type SheetPanelData } from '../sheet-panel/sheet-panel';
import { formatWindow } from '../handover-queue';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

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
  selector: 'app-handover-detail',
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
  templateUrl: './handover-detail.html',
  styleUrl: './handover-detail.scss',
})
export class HandoverDetail {
  /** La ligne choisie dans la file, ou `null` — le rail existe dans les deux cas. */
  readonly entry = input<HandoverQueueEntryView | null>(null);

  /**
   * Un sac est parti par ici. La file se relit chez son appelant : le serveur
   * arbitre la course entre deux comptoirs, et lui seul sait qui a gagné.
   */
  readonly remitted = output<void>();

  /** L'équipe referme le rail. La file reste, et rien n'est sélectionné. */
  readonly cleared = output<void>();

  /**
   * On veut lire le code de cette personne.
   *
   * 🔴 Le rail n'ouvre pas le scanner lui-même : il dit sur QUI on veut le
   * lire, et l'écran ouvre. C'est déjà le contrat de la file — deux surfaces
   * qui ouvriraient chacune leur panneau en donneraient deux au premier
   * double-clic, et seule celle du dessus relirait la file en se fermant.
   */
  readonly scanned = output<HandoverQueueEntryView>();

  private readonly handovers = inject(HandoverQueueService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('idle');

  /**
   * La commande relue **dans la vue de la remise**, et pas dans celle du client.
   *
   * 🔴 C'était une `OrderView` jusqu'au 2026-09-11 — prix unitaires, TVA,
   * totaux, trace de négociation étage par étage. Elle arrivait sur un poste de
   * comptoir avec quelqu'un en face, et seul l'absence d'un `@for` empêchait de
   * l'afficher : ni le typecheck, ni une porte, ni un test ne regardent ce qui
   * n'est pas rendu. `OrderHandoverView` ne porte aucun montant, donc il n'y a
   * plus rien à ne pas afficher.
   *
   * Entière quand même, et pour la raison d'avant : le bon s'ouvre à partir
   * d'elle, sans second aller-retour. Le redemander ferait afficher au bon un
   * état plus récent que la ligne d'où il sort — deux vérités à l'écran.
   */
  protected readonly order = signal<OrderHandoverView | null>(null);

  protected readonly lines = computed<readonly OrderHandoverLine[]>(
    () => this.order()?.lines ?? [],
  );
  protected readonly remitting = signal(false);

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

  /**
   * L'**enseigne**, ou `null` quand elle ne dirait rien de plus que la raison
   * sociale — le serveur a déjà tranché, cf. `tradeNameOf`. On ne refait pas
   * la comparaison ici : deux écrans qui la referaient finiraient par en
   * répondre deux choses.
   */
  protected readonly tradeName = computed<string | null>(() => this.entry()?.tradeName ?? null);

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
        this.order.set(null);
        this.state.set('idle');
        return;
      }
      void this.load();
    });
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
      this.order.set(await this.handovers.byOrderId(entry.orderId));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * **Ouvre le bon**, tel qu'on le coche au comptoir — et sans montant.
   *
   * Il s'ouvrait en téléchargeant un PDF. Sur un poste de comptoir, un fichier
   * qui atterrit dans un dossier n'est pas une lecture : on veut voir la liste,
   * tout de suite, à côté du sac. Le PDF reste à un clic dans le panneau, pour
   * quand on tire vraiment un papier.
   */
  protected openBon(): void {
    const order = this.order();
    const entry = this.entry();
    if (order === null || entry === null) {
      return;
    }
    const data: SheetPanelData = {
      order,
      pickupLabel: entry.pickupLabel,
      customerLabel: entry.customerLabel,
      // Le créneau vient de la LIGNE : la vue de remise sert d'abord l'écran du
      // scan, qui n'a pas de file derrière lui, et ne le porte donc pas.
      window: entry.window,
    };
    this.panels.open<SheetPanelData>(SheetPanel, { data });
  }

  /**
   * **Le scan, depuis le rail** — l'attestation forte, sur la commande ouverte.
   *
   * Il est au-dessus de la remise saisie, et l'ordre est le message : on tend
   * le lecteur d'abord, et on se rabat sur la saisie quand le code manque. Le
   * panneau vérifiera que le code lu désigne bien CETTE commande.
   */
  protected scan(): void {
    const entry = this.entry();
    if (entry !== null) {
      this.scanned.emit(entry);
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
