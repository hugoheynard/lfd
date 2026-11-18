import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldIconComponent,
  FoldPanelHostService,
} from 'fold-ng';

import type { PackingSheet } from '@lfd/contracts';

import {
  PackingPiecesDialog,
  type PackingPiecesDialogData,
  type PackingPiecesLine,
} from '../packing-pieces-dialog/packing-pieces-dialog';
import { PackingSimpleGestures } from '../packing-simple-gestures';

/**
 * **Fermer une commande au colisage simple** (retrait, plan
 * `colisage/plan-niveaux-de-suivi-colisage.md`, D4 à D6) — à la place des
 * contenants : « Tout est prêt », grisé tant que le four n'a pas tout sorti
 * (`allReadyAvailable`, la règle du serveur), et « Problème », qui demande
 * par produit ce qui est vraiment là et prévient le superviseur. Une commande
 * prête garde « Problème ».
 *
 * « Pièces retrouvées » se tient ICI, sous le manque qu'elle répare : sur une
 * commande qui porte un manque, pour qui a le droit d'écriture du poste.
 */
@Component({
  selector: 'app-packing-simple-close',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldIconComponent],
  templateUrl: './packing-simple-close.html',
  styleUrl: './packing-simple-close.scss',
})
export class PackingSimpleClose {
  readonly sheet = input.required<PackingSheet>();

  /** Le droit d'écriture du poste (`production_packing:write`) : « Pièces retrouvées ». */
  readonly canRecover = input(false);

  /** « Tout est prêt » accepté : le poste enchaîne sur la commande suivante. */
  readonly packed = output<PackingSheet>();

  protected readonly gestures = inject(PackingSimpleGestures);
  private readonly panels = inject(FoldPanelHostService);

  /** Le refus de « Tout est prêt » se lit ici ; ceux des dialogues, dans le dialogue. */
  private readonly allReadyTried = signal<string | null>(null);
  protected readonly allReadyRefusal = computed(() =>
    this.allReadyTried() === this.sheet().orderId ? this.gestures.refusal() : null,
  );

  protected readonly ready = computed(() => this.sheet().packedAt !== null);

  /** Un manque signalé, pas encore décidé : le superviseur doit trancher. */
  protected readonly awaitingDecision = computed(() => {
    const sheet = this.sheet();
    return (
      sheet.packedAt === null &&
      sheet.shortfallReportedAt !== null &&
      (sheet.shortfallDecision ?? null) === null
    );
  });

  /** La commande porte-t-elle un manque — signalé ou décidé ? */
  protected readonly hasShortfall = computed(() => {
    const sheet = this.sheet();
    return sheet.shortfallReportedAt !== null || (sheet.shortfallDecision ?? null) !== null;
  });

  protected async allReady(): Promise<void> {
    const sheet = this.sheet();
    this.allReadyTried.set(sheet.orderId);
    if (await this.gestures.allReady(sheet)) {
      this.allReadyTried.set(null);
      this.packed.emit(sheet);
    }
  }

  protected openProblem(): void {
    const sheet = this.sheet();
    this.open({
      title: 'Problème',
      intro: 'Pour chaque produit, la quantité vraiment là. Le reste est mis de côté.',
      confirmLabel: 'Prévenir le superviseur',
      needsOne: false,
      lines: this.linesOf(sheet, 'ordered'),
      submit: (quantities) =>
        this.gestures.reportProblem(sheet, {
          lines: sheet.lines.map((line) => ({
            sku: line.sku,
            present: quantities.get(line.sku) ?? 0,
          })),
        }),
    });
  }

  protected openFound(): void {
    const sheet = this.sheet();
    this.open({
      title: 'Pièces retrouvées',
      intro: 'Pour chaque produit, combien de pièces mises de côté reviennent à la réserve.',
      confirmLabel: 'Rendre à la réserve',
      needsOne: true,
      lines: this.linesOf(sheet, 'none'),
      submit: (quantities) =>
        this.gestures.recoverFound(sheet, {
          lines: [...quantities]
            .filter(([, quantity]) => quantity > 0)
            .map(([sku, quantity]) => ({ sku, quantity })),
        }),
    });
  }

  private linesOf(sheet: PackingSheet, start: 'ordered' | 'none'): PackingPiecesLine[] {
    return sheet.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      saleUnit: line.saleUnit,
      max: line.quantity,
      initial: start === 'ordered' ? line.quantity : 0,
    }));
  }

  private open(question: Omit<PackingPiecesDialogData, 'busy' | 'refusal'>): void {
    this.allReadyTried.set(null);
    this.panels.open<PackingPiecesDialogData>(PackingPiecesDialog, {
      data: { ...question, busy: this.gestures.busy, refusal: this.gestures.refusal },
    });
  }
}
