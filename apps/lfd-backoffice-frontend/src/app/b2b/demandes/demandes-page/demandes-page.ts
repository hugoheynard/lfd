import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import type {
  CustomerRequestStatus,
  CustomerRequestView,
  RequestKind,
  RequestPriority,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CustomerRequestCard } from '../customer-request-card/customer-request-card';
import { CustomerRequestsInbox } from '../customer-requests-inbox.store';
import { CustomerRequestsService } from '../customer-requests.service';
import { REQUEST_KIND_LABELS } from '../request-kinds';

type LoadState = 'loading' | 'ready' | 'error';
type KindFilter = RequestKind | 'all';
type PriorityFilter = RequestPriority | 'all';

const STATUSES: readonly FoldViewToggleOption[] = [
  { value: 'pending', label: 'À traiter' },
  { value: 'handled', label: 'Traitées' },
];
const KINDS: readonly FoldViewToggleOption[] = [
  { value: 'all', label: 'Tous' },
  { value: 'contact', label: REQUEST_KIND_LABELS.contact },
  { value: 'order_problem', label: REQUEST_KIND_LABELS.order_problem },
];
const PRIORITIES: readonly FoldViewToggleOption[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'urgent', label: 'Urgentes' },
  { value: 'medium', label: 'Moyennes' },
  { value: 'low', label: 'Faibles' },
];

/** La valeur d'une bascule, si elle est l'une de celles attendues. */
function pick<T extends string>(value: string, among: readonly T[]): T | undefined {
  return among.find((candidate) => candidate === value);
}

/**
 * **E-commerce LFC › Demandes clients** — les messages « Nous écrire » et les
 * problèmes de commande, dans une seule boîte
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §3.3).
 *
 * L'état et le type vont au serveur ; la priorité filtre la liste reçue, dont
 * l'ordre est celui de l'API (à traiter : urgentes d'abord). La liste « à
 * traiter, tous types » donne aussi le compteur du menu.
 *
 * `?demande=<id>` — le lien du courriel à l'équipe — fait défiler jusqu'à la
 * demande ; traitée entre-temps, on la cherche dans les traitées.
 */
@Component({
  selector: 'app-demandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CustomerRequestCard,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './demandes-page.html',
  styleUrl: './demandes-page.scss',
})
export class DemandesPage {
  /** `?demande=<id>`, posé par le routeur. */
  readonly demande = input<string | undefined>(undefined);

  private readonly api = inject(CustomerRequestsService);
  private readonly inbox = inject(CustomerRequestsInbox);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly statuses = STATUSES;
  protected readonly kinds = KINDS;
  protected readonly priorities = PRIORITIES;

  protected readonly status = signal<CustomerRequestStatus>('pending');
  protected readonly kind = signal<KindFilter>('all');
  protected readonly priority = signal<PriorityFilter>('all');

  protected readonly canWrite = computed(() => this.permissions.can('b2b_contact:write'));
  protected readonly state = signal<LoadState>('loading');
  private readonly requests = signal<readonly CustomerRequestView[]>([]);
  protected readonly busyId = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);

  protected readonly shown = computed(() =>
    this.requests().filter((r) => this.priority() === 'all' || r.priority === this.priority()),
  );
  /** La priorité ne laisse rien d'une liste qui n'est pas vide : un autre vide. */
  protected readonly filteredOut = computed(
    () => this.requests().length > 0 && this.shown().length === 0,
  );

  constructor() {
    void this.openOnTarget();
  }

  protected selectStatus(value: string): void {
    const status = pick(value, ['pending', 'handled'] as const);
    if (status === undefined) return;
    this.status.set(status);
    void this.load();
  }

  protected selectKind(value: string): void {
    const kind = pick(value, ['all', 'contact', 'order_problem'] as const);
    if (kind === undefined) return;
    this.kind.set(kind);
    void this.load();
  }

  protected selectPriority(value: string): void {
    const priority = pick(value, ['all', 'urgent', 'medium', 'low'] as const);
    if (priority !== undefined) this.priority.set(priority);
  }

  protected async load(): Promise<void> {
    this.refusal.set(null);
    this.state.set('loading');
    try {
      this.show(await this.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async markHandled(request: CustomerRequestView): Promise<void> {
    if (this.busyId() !== null || !this.canWrite()) return;
    this.busyId.set(request.id);
    this.refusal.set(null);
    try {
      await this.api.markHandled(request.id);
      this.notify.success('Demande marquée traitée.');
      this.show(await this.read());
      // Filtrée par type, la liste ne compte pas tout : le menu relit.
      if (this.kind() !== 'all') void this.inbox.refresh();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La demande n'a pas pu être marquée traitée."));
    } finally {
      this.busyId.set(null);
    }
  }

  /** Le premier chargement ; avec `?demande=`, cherche la demande dans les traitées si besoin. */
  private async openOnTarget(): Promise<void> {
    await this.load();
    const target = this.demande();
    if (target === undefined || this.state() !== 'ready') return;
    if (!this.requests().some((r) => r.id === target)) {
      this.status.set('handled');
      await this.load();
    }
    afterNextRender(
      () => {
        this.host.nativeElement
          .querySelector(`[data-request="${CSS.escape(target)}"]`)
          ?.scrollIntoView({ block: 'start' });
      },
      { injector: this.injector },
    );
  }

  private read(): Promise<CustomerRequestView[]> {
    const kind = this.kind();
    return this.api.list(this.status(), kind === 'all' ? undefined : kind);
  }

  /** Pose la liste ; « à traiter, tous types » donne aussi le compteur du menu. */
  private show(requests: readonly CustomerRequestView[]): void {
    this.requests.set(requests);
    if (this.status() === 'pending' && this.kind() === 'all') this.inbox.set(requests.length);
  }
}
