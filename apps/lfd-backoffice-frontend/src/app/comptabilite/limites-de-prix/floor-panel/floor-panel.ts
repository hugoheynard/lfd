import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { FloorClientele } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldDangerZoneComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { formatEuros } from '@lfd/catalog-ui';

import { NotifyService } from '../../../notify.service';
import {
  ArchivePanel,
  type ArchivePanelData,
} from '../../../b2b/tarification/archive-panel/archive-panel';
import {
  JournalPanel,
  type JournalPanelData,
} from '../../../b2b/tarification/journal-panel/journal-panel';
import { floorLabel } from '../../../b2b/tarification/pricing-format';
import { PriceLimitsService } from '../../price-limits.service';
import { FloorValueForm, type FloorValueDraft } from '../floor-value-form/floor-value-form';
import { ScopePicker, type FloorTarget, type ScopeChoice } from '../scope-picker/scope-picker';

/**
 * Charge d'ouverture : la clientèle, le droit, et la portée visée — ou les
 * portées parmi lesquelles la choisir (« Créer une limite »).
 */
export interface FloorPanelData {
  /** La clientèle visée — la même portée peut porter une limite pro et une publique. */
  readonly clientele: FloorClientele;
  /**
   * `lfc_price_limits:write` ? Sans lui, le panneau s'ouvre en LECTURE : même
   * contenu, ni enregistrement, ni confirmation, ni zone danger.
   */
  readonly canWrite: boolean;
  /** La portée visée, ou `null` : elle se choisit alors dans le panneau. */
  readonly target: FloorTarget | null;
  /** Les portées proposées quand `target` est `null`. */
  readonly choices: readonly ScopeChoice[];
}

/** Un mois « de calendrier » pour dire l'âge d'une limite. */
const DAYS_PER_MONTH = 30;

/**
 * Panneau **Limite** — le prix ne descendra pas sous ce seuil. Il pose quand
 * rien n'est posé, et modifie sinon.
 *
 * Né dans la Tarification B2B, il vit dans la Comptabilité depuis que les
 * limites relèvent de `lfc_price_limits` (`plan-limites-de-prix.md` §6). Il y a
 * gagné la clientèle, qu'il envoie à chaque geste, et le choix de la portée.
 *
 * Deux choses que cet écran doit dire, parce qu'elles surprennent :
 *
 * - **poser une limite sur un article REMPLACE celle de sa famille**, elle ne
 *   s'y ajoute pas. Elle peut donc l'abaisser — d'où le rappel de la limite
 *   héritée, juste à côté ;
 * - **une fraction suit le tarif** quand le PIM augmente ; un montant non.
 */
@Component({
  selector: 'app-floor-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FloorValueForm,
    ScopePicker,
  ],
  templateUrl: './floor-panel.html',
  styleUrl: './floor-panel.scss',
})
export class FloorPanel {
  private readonly limits = inject(PriceLimitsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly panels = inject(FoldPanelHostService);

  readonly data = input<FloorPanelData | undefined>(undefined);

  /** La portée choisie dans le panneau, quand elle n'était pas donnée. */
  protected readonly picked = signal<FloorTarget | null>(null);
  protected readonly draft = signal<FloorValueDraft | null>(null);
  protected readonly saving = signal(false);

  protected readonly euros = formatEuros;

  /** La portée qu'on règle : celle donnée à l'ouverture, ou celle choisie ici. */
  protected readonly focus = computed(() => this.data()?.target ?? this.picked());
  protected readonly choosing = computed(() => this.data()?.target === null);
  protected readonly choices = computed(() => this.data()?.choices ?? []);

  protected readonly target = computed(() => this.focus()?.target ?? '');
  protected readonly canWrite = computed(() => this.data()?.canWrite === true);
  protected readonly current = computed(() => this.focus()?.current ?? null);
  protected readonly canonicalMillicents = computed(
    () => this.focus()?.canonicalMillicents ?? null,
  );

  /** Un montant en euros n'a de sens que sur une unité — le formulaire le dit. */
  protected readonly unitScoped = computed(() => {
    const type = this.focus()?.scope.type;
    return type === 'product' || type === 'variant';
  });

  protected readonly subtitle = computed(() => {
    const who = this.data()?.clientele === 'public' ? 'pour le public' : 'pour les pros';
    const where = this.focus() === null ? 'Choisissez une portée' : `Sur ${this.target()}`;
    return `${where}, ${who}. Le prix ne descendra pas sous ce seuil.`;
  });

  /** L'écart entre l'intention et le tarif du jour, s'il y a lieu de le montrer. */
  protected readonly drift = computed(() => this.current()?.drift ?? null);

  /** « +12,4 % » — signé, parce qu'une baisse de tarif compte aussi. */
  protected readonly driftLabel = computed(() => {
    const drift = this.drift();
    if (drift === null) {
      return '';
    }
    const percent = (drift.driftBp / 100).toFixed(1).replace('.', ',');
    return drift.driftBp > 0 ? `+${percent} %` : `${percent} %`;
  });

  /** L'âge en mois pleins : « il y a 8 mois » se lit mieux que « 240 jours ». */
  protected readonly ageLabel = computed(() => {
    const days = this.drift()?.ageDays ?? 0;
    const months = Math.floor(days / DAYS_PER_MONTH);
    return months >= 1 ? `${String(months)} mois` : `${String(days)} jours`;
  });

  /**
   * La limite dont on hérite, **quand ce n'est pas la sienne**. C'est celle-là
   * qu'un remplacement fait sauter, donc c'est celle qu'il faut montrer.
   */
  protected readonly inherited = computed(() => {
    const focus = this.focus();
    if (focus === null || focus.inherited === null) {
      return null;
    }
    return focus.inherited.id === focus.current?.id ? null : focus.inherited;
  });

  protected readonly inheritedLabel = computed(() => {
    const heritee = this.inherited();
    return heritee === null ? '' : floorLabel(heritee);
  });

  protected readonly canSubmit = computed(
    () => this.canWrite() && this.focus() !== null && this.draft() !== null,
  );

  protected pick(choice: ScopeChoice): void {
    this.picked.set(choice);
  }

  protected async submit(): Promise<void> {
    const data = this.data();
    const focus = this.focus();
    const draft = this.draft();
    if (data === undefined || focus === null || draft === null || !this.canSubmit()) {
      return;
    }
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.limits.setFloor({ scope: focus.scope, clientele: data.clientele, ...draft });
      this.notify.success('Limite posée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La limite n'a pas pu être posée.");
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * **Maintenir** l'intention : la limite ne change pas, sa référence et sa date
   * repartent d'aujourd'hui. C'est ce qui éteint le signal « à confirmer », sans
   * changer une décision pour faire taire un rappel.
   */
  protected async confirm(): Promise<void> {
    const data = this.data();
    const focus = this.focus();
    if (data === undefined || focus === null || !data.canWrite || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.limits.confirmFloor(focus.scope, data.clientele);
      this.notify.success('Limite confirmée — elle repart pour un tour.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La limite n'a pas pu être confirmée.");
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * **Retirer**, depuis la zone danger du bas, ouvre le panneau d'archivage,
   * qui demande pourquoi. La zone ne confirme rien elle-même : le motif EST la
   * confirmation, et deux « êtes-vous sûr ? » d'affilée n'en font pas une
   * meilleure.
   */
  protected retire(): void {
    const data = this.data();
    const focus = this.focus();
    const current = this.current();
    if (data === undefined || focus === null || !data.canWrite || current === null) {
      return;
    }
    this.panels.open<ArchivePanelData, boolean>(ArchivePanel, {
      data: {
        subject: { kind: 'floor', scope: focus.scope, clientele: data.clientele },
        target: focus.target,
        summary: `Limite sur ${focus.target} — ${floorLabel(current)}`,
      },
      width: 'md',
    });
  }

  /**
   * **Le journal de cette limite** : qui l'a posée, qui l'a confirmée, quand.
   * Il REMPLACE ce panneau plutôt que de s'empiler dessus.
   */
  protected openJournal(): void {
    const current = this.current();
    if (current === null) {
      return;
    }
    this.panels.open<JournalPanelData, boolean>(JournalPanel, {
      data: { subjectType: 'floor', subjectId: current.id, target: this.target() },
      width: 'md',
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
