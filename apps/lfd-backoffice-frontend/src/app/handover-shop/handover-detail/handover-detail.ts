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
import type {
  HandoverQueueEntryView,
  OrderHandoverLine,
  OrderHandoverView,
  PackingAbandonedLine,
  PackingSheet,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldMeterComponent,
  FoldPanelHostService,
  FoldSurfaceDirective,
} from 'fold-ng';

import { CounterIncompleteHandoverService } from '../../comptoir/counter-incomplete-handover.service';
import { NotifyService } from '../../notify.service';
import { PackingService } from '../../production/packing.service';
import { HandoverQueueService } from '../handover-queue.service';
import { MissingItems } from '../missing-items/missing-items';
import {
  CounterNotePanel,
  type CounterDocument,
  type CounterNotePanelData,
} from '../counter-note-panel/counter-note-panel';
import {
  IncompleteHandoverDialog,
  type IncompleteHandoverDialogData,
  type IncompleteHandoverOutcome,
} from '../incomplete-handover-dialog/incomplete-handover-dialog';
import { allRanks, ShipmentChoice } from '../shipment-choice/shipment-choice';
import { formatWindow, stillRemittable, type ScanProof } from '../handover-queue';
import { transferBlockReason } from '../handover-transfer';
import {
  bagReadiness,
  gestureCaution,
  gesturesMuted,
  lineMarks,
  pieceCount,
  readyVerdict,
} from './bag-readiness';
import { SaleQuantityPipe } from '../../shared/sale-quantity/sale-quantity.pipe';

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
 * 🔴 **Deux remises, et chacune dit ce qu'elle prouve.** Le scan prouve la
 * présence ; un clic non. Le serveur porte donc deux verbes :
 *
 * Un seul bouton, « Remettre la commande » (2026-10-25), dont la preuve suit
 * le scan :
 *
 * - **ouverte par le code** (`proof`), il renvoie le jeton lu et grave `scan`.
 *   Le scan n'atteste plus rien de lui-même : il identifie, on remet ici ;
 * - **sans code**, il grave `manual` — une attestation **faible et honnête**,
 *   annoncée au-dessus du bouton (« QR non scanné… »).
 *
 * ⚠️ Le JSDoc disait « il n'atteste aucune remise » jusqu'au 2026-09-11.
 * Refuser le geste ne le supprimait pas : il renvoyait le cas de tous les
 * matins — un client sans téléphone — vers un contournement que rien ne trace.
 */
@Component({
  selector: 'app-handover-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SaleQuantityPipe,
    MissingItems,
    ShipmentChoice,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldMeterComponent,
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
  /** Le jour de service de la file — celui dont on lit le colisage. */
  readonly day = input.required<string>();

  /**
   * Le code lu juste avant, quand c'est LUI qui a ouvert cette fiche — sinon
   * `null`. L'écran ne le passe que pour la commande qu'il désigne.
   */
  readonly proof = input<ScanProof | null>(null);

  /** La preuve, seulement si elle désigne la commande ouverte. */
  protected readonly activeProof = computed<ScanProof | null>(() => {
    const proof = this.proof();
    return proof !== null && proof.orderId === this.entry()?.orderId ? proof : null;
  });

  /**
   * Un sac est parti par ici. La file se relit chez son appelant : le serveur
   * arbitre la course entre deux comptoirs, et lui seul sait qui a gagné.
   */
  readonly remitted = output<void>();

  /** L'équipe referme le rail. La file reste, et rien n'est sélectionné. */
  readonly cleared = output<void>();

  private readonly handovers = inject(HandoverQueueService);
  private readonly packing = inject(PackingService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly incomplete = inject(CounterIncompleteHandoverService);

  protected readonly state = signal<LoadState>('idle');

  /**
   * La commande relue **dans la vue du retrait**, et pas dans celle du client.
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
   * Les envois prêts quand il y en a au moins DEUX (plan E7 reliquat, choix
   * 13, L4c) — vide sinon, et l'écran reste celui d'avant.
   */
  protected readonly shipments = computed(() => {
    const shipments = this.order()?.shipments ?? [];
    return shipments.length > 1 ? shipments : [];
  });
  /** Les rangs cochés — tous, à chaque commande ouverte. */
  protected readonly checked = signal<readonly number[]>([]);
  /** Deux envois et aucun coché : rien à remettre, le bouton se tait. */
  protected readonly nothingChecked = computed(
    () => this.shipments().length > 0 && this.checked().length === 0,
  );

  /** Le reste abandonné d'un départ incomplet décidé — vide sinon. */
  protected readonly abandoned = computed<readonly PackingAbandonedLine[]>(
    () => this.entry()?.abandonedRemainder ?? [],
  );

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
   * La fiche de colis de la commande ouverte, relue au colisage du jour —
   * `null` avant l'arrêt du plan ou pour une commande hors plan.
   */
  private readonly sheet = signal<PackingSheet | null>(null);
  protected readonly readiness = computed(() => bagReadiness(this.sheet()));
  /** « au bac / total », ou le total seul en succès quand tout est fait. */
  protected readonly pieces = computed(() =>
    pieceCount(this.sheet(), this.readiness(), this.entry()?.totalUnits ?? 0),
  );
  /** Les coches fournil et colisage de chaque ligne, par SKU. */
  protected readonly marks = computed(() => lineMarks(this.sheet()));
  protected readonly verdict = computed(() => readyVerdict(this.entry(), this.readiness()));

  /**
   * Les gestes passent en retrait tant que le four ou le bac n'a pas fini
   * (Hugo, 2026-09-28), ou que le contrôle qualité retient la commande (QC5). **Atténués, jamais désactivés** : le client est
   * physiquement là, et le monde réel prime sur l'écran (`handoverBlocker`).
   */
  protected readonly caution = computed(() => gestureCaution(this.entry()));
  protected readonly muted = computed(() => gesturesMuted(this.entry(), this.readiness()));

  /**
   * **Le sac n'est pas fini** : le bouton du rail devient « Procédure commande
   * incomplète » (Hugo, 2026-11-03). Faute de fiche de colis (plan non
   * arrêté, commande hors plan), il n'y a rien à juger : la remise ordinaire
   * reste. Deux envois prêts gardent leur propre geste (L4c).
   */
  protected readonly incompleteProcedure = computed<boolean>(() => {
    const bag = this.readiness();
    return bag !== null && !bag.ready && this.shipments().length === 0;
  });

  /** Peut-on encore tendre ce sac ? La règle vit dans `handover-queue.ts`. */
  protected readonly remittable = computed<boolean>(() => {
    const entry = this.entry();
    return entry !== null && stillRemittable(entry.state) && this.transferBlock() === null;
  });

  /**
   * Son transfert n'est pas reçu au site : le serveur refuse la remise
   * (`handover.transfer_not_received`), l'écran ne l'arme pas et dit pourquoi.
   */
  protected readonly transferBlock = computed<string | null>(() => {
    const entry = this.entry();
    return entry === null ? null : transferBlockReason(entry);
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
        this.sheet.set(null);
        this.state.set('idle');
        return;
      }
      void this.load();
      void this.loadSheet(entry.reference, this.day());
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
      const order = await this.handovers.byOrderId(entry.orderId);
      this.order.set(order);
      this.checked.set(allRanks(order.shipments));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Une fiche illisible se tait : les barres disparaissent, le retrait reste possible. */
  private async loadSheet(reference: string, day: string): Promise<void> {
    this.sheet.set(null);
    try {
      const packing = await this.packing.packing(day);
      if (this.entry()?.reference === reference) {
        this.sheet.set(packing.sheets.find((sheet) => sheet.reference === reference) ?? null);
      }
    } catch {
      this.sheet.set(null);
    }
  }

  /**
   * **Ouvre un des deux bons chiffrés** dans un dialogue (Hugo, 2026-11-03) :
   * il remplace la fiche sans prix, qui redisait ce que le rail montre déjà.
   */
  protected openDocument(document: CounterDocument): void {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    const data: CounterNotePanelData = {
      orderId: entry.orderId,
      reference: entry.reference,
      document,
    };
    this.panels.open<CounterNotePanelData>(CounterNotePanel, { data });
  }

  /**
   * **Procédure commande incomplète** (lot C2, Hugo, 2026-11-03) : lit
   * l'aperçu, puis — tout est réparti (`nothing_short`) — remet comme
   * « Remettre la commande », sans dialogue ; sinon ouvre le dialogue, qui
   * offre le geste partiel ou dit le refus.
   *
   * Le geste partiel porte le jeton du QR quand un scan a ouvert la fiche
   * (Hugo, 2026-11-03) : le serveur grave alors `scan`. Un manque déjà
   * tranché ferme le dialogue sur `remit` : le rail fait la remise ordinaire.
   */
  protected async startIncomplete(): Promise<void> {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    this.remitting.set(true);
    let data: IncompleteHandoverDialogData;
    try {
      const view = await this.incomplete.preview(entry.orderId);
      data = {
        orderId: entry.orderId,
        reference: entry.reference,
        view,
        token: this.activeProof()?.token ?? null,
      };
    } catch (caught) {
      this.notify.error(caught, "L'état du bac n'a pas pu être relu.");
      return;
    } finally {
      this.remitting.set(false);
    }
    if (data.view.refusal === 'nothing_short') {
      await this.remit();
      return;
    }
    const ref = this.panels.open<IncompleteHandoverDialogData, IncompleteHandoverOutcome>(
      IncompleteHandoverDialog,
      { data },
    );
    const outcome = await ref.closed;
    if (outcome === 'partial') {
      this.remitted.emit();
    } else if (outcome === 'remit') {
      // Manque déjà tranché, ou sac fermé : la remise ordinaire, avec sa preuve.
      await this.remit();
    }
  }

  /**
   * **Le seul geste de remise** (Hugo, 2026-10-25).
   *
   * 🔴 Sa preuve dépend du scan, pas du bouton : la fiche ouverte par le QR
   * renvoie le jeton lu et le serveur grave `scan` ; sinon elle part sur le
   * numéro et grave `manual`. La lecture du code n'a rien gravé — c'est ici,
   * et ici seulement, qu'on écrit.
   */
  protected async remit(): Promise<void> {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    const proof = this.activeProof();
    // Deux envois prêts : les rangs cochés ; un seul : le corps d'avant (L4c).
    const ranks = this.shipments().length > 0 ? this.checked() : null;
    this.remitting.set(true);
    try {
      if (proof !== null) {
        await this.handovers.confirmScanned(proof.token, ranks);
      } else {
        await this.handovers.confirmManually(entry.reference, ranks);
      }
      this.remitted.emit();
    } catch (caught) {
      this.notify.error(caught, "Ce retrait n'a pas pu être enregistré.");
    } finally {
      this.remitting.set(false);
    }
  }
}
