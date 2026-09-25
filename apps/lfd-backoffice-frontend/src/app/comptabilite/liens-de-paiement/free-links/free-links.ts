import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PaymentLinkStatus, PaymentLinkView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  type FoldBadgeVariant,
  type FoldTableColumn,
} from 'fold-ng';

import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { centsField, centsOf } from '../../cents-field';
import { copyLink } from '../../copy-link';
import { PaymentLinksService } from '../../payment-links.service';
import { NewLinkPanel, type NewLinkPanelData } from '../new-link-panel/new-link-panel';

const STATUS: Readonly<
  Record<PaymentLinkStatus, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  open: { label: 'Ouvert', variant: 'info' },
  paid: { label: 'Réglé', variant: 'success' },
  cancelled: { label: 'Annulé', variant: 'neutral' },
  expired: { label: 'Expiré', variant: 'warning' },
};

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'company', label: 'Société' },
  { key: 'label', label: 'Libellé' },
  { key: 'amount', label: 'Montant' },
  { key: 'createdAt', label: 'Créé le' },
  { key: 'status', label: 'État' },
  { key: 'link', label: 'Lien' },
];

/**
 * Ce que rend la lecture du champ de plafond : vide = aucun plafond (`null`),
 * sinon des centimes entiers, ou `undefined` quand la saisie est illisible.
 */
export function capOf(raw: string): number | null | undefined {
  if (raw.trim() === '') {
    return null;
  }
  return centsOf(raw) ?? undefined;
}

/**
 * **Les liens libres** — une somme demandée à un client hors commande, réglée
 * sur une page Stripe. On y lit leur état, on copie l'URL, on annule un lien
 * encore ouvert, on en crée un, et on règle le plafond d'un lien.
 *
 * Le plafond est un réglage du comptable (Hugo, 2026-09-25) : vide = aucun
 * plafond. Il est lu par le serveur à la CRÉATION ; le baisser ne touche pas
 * les liens déjà émis.
 */
@Component({
  selector: 'app-free-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './free-links.html',
  styleUrl: './free-links.scss',
})
export class FreeLinks {
  private readonly api = inject(PaymentLinksService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly rows = signal<readonly PaymentLinkView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  /** Le lien dont l'annulation est en vol. */
  protected readonly pending = signal<string | null>(null);

  /** Le plafond tel que le serveur le tient, et tel qu'il est saisi. */
  protected readonly maxCents = signal<number | null>(null);
  protected readonly capInput = signal('');
  protected readonly savingCap = signal(false);
  protected readonly capError = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );

  protected readonly rowKey = (row: PaymentLinkView): string => row.id;

  protected readonly capParsed = computed(() => capOf(this.capInput()));
  protected readonly capInvalid = computed(() => this.capParsed() === undefined);
  protected readonly capDirty = computed(() => this.capParsed() !== this.maxCents());
  protected readonly capSummary = computed(() => {
    const max = this.maxCents();
    return max === null ? 'Aucun plafond' : `Au plus ${formatCents(max)} par lien`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [rows, settings] = await Promise.all([this.api.listLinks(), this.api.readSettings()]);
      this.rows.set(rows);
      this.setCap(settings.paymentLinkMaxCents);
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les liens de paiement sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusOf(row: PaymentLinkView): {
    readonly label: string;
    readonly variant: FoldBadgeVariant;
  } {
    return STATUS[row.status];
  }

  protected amountOf(row: PaymentLinkView): string {
    return formatCents(row.amountCents);
  }

  protected dateOf(row: PaymentLinkView): string {
    return formatOrderDate(row.createdAt);
  }

  protected async copy(row: PaymentLinkView): Promise<void> {
    await copyLink(row.url, this.notify);
  }

  protected async create(): Promise<void> {
    const data: NewLinkPanelData = { maxCents: this.maxCents() };
    const done = await this.panels.open<NewLinkPanelData, boolean>(NewLinkPanel, {
      data,
      width: 'md',
    }).closed;
    if (done === true) {
      await this.reload();
    }
  }

  protected async cancel(row: PaymentLinkView): Promise<void> {
    this.pending.set(row.id);
    this.actionError.set(null);
    try {
      await this.api.cancelLink(row.id);
      this.notify.success(`Lien « ${row.label} » annulé.`);
      await this.reload();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, "Le lien n'a pas pu être annulé."));
    } finally {
      this.pending.set(null);
    }
  }

  protected async saveCap(): Promise<void> {
    const cap = this.capParsed();
    if (cap === undefined) {
      return;
    }
    this.savingCap.set(true);
    this.capError.set(null);
    try {
      await this.api.saveSettings({ paymentLinkMaxCents: cap });
      this.setCap(cap);
      this.notify.success(cap === null ? 'Plafond retiré.' : `Plafond fixé à ${formatCents(cap)}.`);
    } catch (caught) {
      this.capError.set(httpErrorMessage(caught, "Le plafond n'a pas pu être enregistré."));
    } finally {
      this.savingCap.set(false);
    }
  }

  private setCap(cents: number | null): void {
    this.maxCents.set(cents);
    this.capInput.set(cents === null ? '' : centsField(cents));
  }

  /** Relecture après un geste : l'état et l'auteur sont posés par le serveur. */
  private async reload(): Promise<void> {
    try {
      this.rows.set(await this.api.listLinks());
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'La liste n’a pas pu être relue.'));
    }
  }
}
