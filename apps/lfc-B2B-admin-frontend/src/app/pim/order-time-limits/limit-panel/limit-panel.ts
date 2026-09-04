import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  OrderTimeLimitPayload,
  OrderTimeLimitScope,
  OrderTimeLimitScopeType,
  OrderTimeLimitView,
} from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { daysPhrase, gracePhrase, scopeLabel } from '../limit-format';

/** Une cible proposable : une famille du catalogue. */
export interface LimitTargetChoice {
  readonly id: string;
  readonly label: string;
}

/** Charge d'ouverture : la règle à modifier, ou `null` pour en poser une. */
export interface LimitPanelData {
  readonly rule: OrderTimeLimitView | null;
  /** Les familles, pour le sélecteur de portée. */
  readonly categories: readonly LimitTargetChoice[];
  /**
   * Une portée **imposée**, quand le panneau s'ouvre depuis l'objet lui-même —
   * la fiche d'un produit, une de ses déclinaisons.
   *
   * Le sélecteur disparaît alors : on est déjà dans le contexte de la cible, et
   * proposer d'en changer inviterait à poser depuis cet écran une règle qui vise
   * autre chose que ce qu'on regarde.
   */
  readonly preset?: { readonly scope: OrderTimeLimitScope; readonly label: string };
}

/** La valeur qui dit « ce rang ne se prononce pas » dans les sélecteurs. */
const INHERIT = '';

const DAYS_CHOICES: FoldSelectOption<string>[] = [
  { value: INHERIT, label: 'Hériter du rang supérieur' },
  { value: '0', label: 'Le jour même' },
  { value: '1', label: 'La veille' },
  { value: '2', label: "L'avant-veille" },
  { value: '3', label: '3 jours avant' },
  { value: '7', label: 'Une semaine avant' },
];

const GRACE_CHOICES: FoldSelectOption<string>[] = [
  { value: INHERIT, label: 'Hériter du rang supérieur' },
  { value: '0', label: 'Aucun — la limite est ferme' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 heure' },
  { value: '120', label: '2 heures' },
];

/**
 * Panneau **Limite de commande** — pose ou modifie la règle d'une portée.
 *
 * ## Les trois champs sont indépendants, et c'est tout le sujet
 *
 * Chacun peut dire « hériter ». « Le pain ferme à 16 h » ne recopie pas le
 * nombre de jours ; « l'entremets demande un jour de plus » ne recopie pas
 * l'heure. Le jour où le labo passe de 18 h à 16 h, tout ce qui n'a pas d'heure
 * propre suit — alors qu'une règle recopiée entière serait restée figée.
 *
 * L'heure hérite quand le champ est **vide** : `<input type="time">` sait être
 * vide, et un second contrôle « hériter / préciser » aurait posé la même
 * question deux fois.
 *
 * ## Ce que ce panneau ne fait pas
 *
 * Il ne pose **pas** de limite sur un produit ni sur une déclinaison. Ces
 * rangs-là existent et se lisent dans la liste, mais se posent depuis la fiche
 * du produit — c'est là qu'on regarde quand on se demande combien de temps CET
 * article demande, et un sélecteur de produit dans un écran de réglages ferait
 * chercher au mauvais endroit.
 */
@Component({
  selector: 'app-limit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldListboxComponent,
  ],
  templateUrl: './limit-panel.html',
})
export class LimitPanel {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<LimitPanelData | undefined>(undefined);

  protected readonly daysChoices = DAYS_CHOICES;
  protected readonly graceChoices = GRACE_CHOICES;
  protected readonly inherit = INHERIT;

  protected readonly scopeType = signal<OrderTimeLimitScopeType>('global');
  protected readonly scopeId = signal<string | null>(null);
  protected readonly daysBefore = signal<string>(INHERIT);
  protected readonly time = signal<string>('');
  protected readonly graceMinutes = signal<string>(INHERIT);
  protected readonly saving = signal(false);

  protected readonly categories = computed(() => this.data()?.categories ?? []);
  protected readonly editing = computed(() => this.data()?.rule ?? null);
  protected readonly isCreate = computed(() => this.editing() === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle limite de commande' : 'Modifier la limite',
  );

  /**
   * La portée ne se change **pas** à la modification : déplacer une règle d'une
   * famille à l'autre n'est pas une modification, c'est une suppression et une
   * création. Le confondre ferait perdre la trace de ce qui s'appliquait à
   * l'ancienne portée.
   */
  protected readonly scopeLocked = computed(
    () => !this.isCreate() || this.data()?.preset !== undefined,
  );

  /** Ce que la portée vise, en clair, quand elle est verrouillée. */
  protected readonly lockedScopeLabel = computed(() => {
    const preset = this.data()?.preset;
    if (preset !== undefined) {
      return preset.label;
    }
    const rule = this.editing();
    return rule === null ? '' : scopeLabel(rule);
  });

  protected readonly scopeChoices = computed<FoldSelectOption<string>[]>(() => [
    { value: 'global', label: 'Toute la production' },
    ...this.categories().map((category) => ({
      value: `category:${category.id}`,
      label: `Famille — ${category.label}`,
    })),
  ]);

  protected readonly scopeValue = computed(() =>
    this.scopeType() === 'global' ? 'global' : `${this.scopeType()}:${this.scopeId() ?? ''}`,
  );

  /**
   * Une règle qui ne dit rien est refusée par le serveur, et l'écran ne doit pas
   * l'envoyer pour l'apprendre. Pour ne rien dire, on **supprime** la règle —
   * c'est le même geste, et il est lisible.
   */
  protected readonly saysSomething = computed(
    () =>
      this.daysBefore() !== INHERIT || this.time().trim() !== '' || this.graceMinutes() !== INHERIT,
  );

  protected readonly canSubmit = computed(() => this.saysSomething() && !this.saving());

  /** La règle relue en une phrase, pour la vérifier avant d'enregistrer. */
  protected readonly recap = computed(() => {
    const jours = daysPhrase(numberOrNull(this.daysBefore()));
    const heure = this.time().trim() === '' ? 'Hérité' : this.time();
    const grace = gracePhrase(numberOrNull(this.graceMinutes()));
    return `Délai : ${jours.toLowerCase()} · Heure : ${heure} · Rattrapage : ${grace.toLowerCase()}.`;
  });

  constructor() {
    effect(() => {
      const preset = this.data()?.preset;
      if (preset !== undefined) {
        this.scopeType.set(preset.scope.type);
        this.scopeId.set(preset.scope.id);
      }
      const rule = this.data()?.rule ?? null;
      if (rule === null) {
        return;
      }
      this.scopeType.set(rule.scope.type);
      this.scopeId.set(rule.scope.id);
      this.daysBefore.set(rule.daysBefore === null ? INHERIT : String(rule.daysBefore));
      this.time.set(rule.time ?? '');
      this.graceMinutes.set(rule.graceMinutes === null ? INHERIT : String(rule.graceMinutes));
    });
  }

  protected onScope(value: string): void {
    if (value === 'global') {
      this.scopeType.set('global');
      this.scopeId.set(null);
      return;
    }
    const [, id = ''] = value.split(':');
    this.scopeType.set('category');
    this.scopeId.set(id);
  }

  protected onDays(value: string): void {
    this.daysBefore.set(value);
  }

  protected onGrace(value: string): void {
    this.graceMinutes.set(value);
  }

  protected onTime(event: Event): void {
    this.time.set((event.target as HTMLInputElement).value);
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    const payload: OrderTimeLimitPayload = {
      scope: { type: this.scopeType(), id: this.scopeId() },
      daysBefore: numberOrNull(this.daysBefore()),
      time: this.time().trim() === '' ? null : this.time(),
      graceMinutes: numberOrNull(this.graceMinutes()),
    };
    try {
      await this.api.set(payload);
      this.notify.success('Limite enregistrée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** `''` = « ce rang ne se prononce pas ». Tout le reste est un entier. */
function numberOrNull(value: string): number | null {
  return value === INHERIT ? null : Number(value);
}
