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
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTimeComponent,
} from 'fold-ng';
import type { AvailabilityConfigView, AvailabilityRulePayload } from '@lfd/contracts';

import { AvailabilityService } from '../../../../commercial/availability/availability.service';
import { NotifyService } from '../../../../notify.service';

import {
  addRange,
  clearDay,
  copyToWeekdays,
  editRange,
  gridPayload,
  hasInvalidRange,
  removeRange,
  sameRules,
  toPayload,
  WEEK_DAYS,
  type AvailabilityDraft,
  type DraftRange,
} from '../availability-draft';

/**
 * Carte **Semaine type** : les plages où le commercial accepte des rendez-vous,
 * jour par jour.
 *
 * Le brouillon descend en `input` et remonte modifié par `changed` : la carte ne
 * possède pas l'état, elle applique les fonctions pures d'`availability-draft`.
 * C'est ce qui permet aux quatre cartes d'éditer le **même** brouillon sans
 * qu'aucune ne devienne la source de vérité.
 *
 * **Elle enregistre elle-même**, comme les deux autres cartes éditables, et
 * n'envoie que ses règles : les exceptions et la politique partent telles
 * qu'elles sont en base (`gridPayload`), pour ne pas emporter des édits que
 * personne n'a validés. Son pied n'existe que s'il y a quelque chose à écrire —
 * un bouton toujours là inviterait à un appel qui n'écrirait rien.
 */
@Component({
  selector: 'app-week-grid-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldTimeComponent, FoldButtonComponent],
  templateUrl: './week-grid-card.html',
  styleUrl: './week-grid-card.scss',
})
export class WeekGridCard {
  private readonly service = inject(AvailabilityService);
  private readonly notify = inject(NotifyService);

  readonly draft = input.required<AvailabilityDraft>();
  /**
   * La configuration **telle qu'elle est en base**. Sert de référence au
   * « modifié », et fournit les deux tranches que cette carte n'édite pas mais
   * doit renvoyer intactes.
   */
  readonly persistedConfig = input<AvailabilityConfigView | null>(null);
  readonly changed = output<AvailabilityDraft>();
  /** Enregistré : le parent réaligne sa tranche et recharge l'aperçu. */
  readonly persisted = output<AvailabilityConfigView>();

  protected readonly weekDays = WEEK_DAYS;

  protected readonly saving = signal(false);

  /** Ce qu'on enverrait — plages incohérentes déjà écartées. */
  private readonly rules = computed<readonly AvailabilityRulePayload[]>(
    () => toPayload(this.draft()).rules,
  );

  protected readonly dirty = computed(() => {
    const persisted = this.persistedConfig();
    return persisted !== null && !sameRules(this.rules(), persisted.rules);
  });

  /**
   * Le résultat part en **toast** : une fois enregistré le pied disparaît (plus
   * rien n'est modifié), et un message posé là où le bouton vient de s'effacer
   * n'aurait nulle part où tenir.
   */
  protected async save(): Promise<void> {
    const persisted = this.persistedConfig();
    if (persisted === null) {
      return;
    }
    this.saving.set(true);
    try {
      // On remonte ce que le SERVEUR a écrit, pas ce qu'on croit avoir envoyé.
      this.persisted.emit(await this.service.save(gridPayload(this.draft(), persisted)));
      this.notify.success('Semaine type enregistrée.');
    } catch (error) {
      this.notify.error(error, "L'enregistrement de la semaine type a échoué.");
    } finally {
      this.saving.set(false);
    }
  }

  /** Les plages d'un jour de semaine (index `Date.getDay()`). */
  protected rangesOf(weekday: number): readonly DraftRange[] {
    return this.draft().week[weekday] ?? [];
  }

  /** Une plage dont la fin précède le début : on le dit avant d'enregistrer. */
  protected get invalid(): boolean {
    return hasInvalidRange(this.draft());
  }

  protected addRange(weekday: number): void {
    this.changed.emit(addRange(this.draft(), weekday));
  }

  protected removeRange(weekday: number, index: number): void {
    this.changed.emit(removeRange(this.draft(), weekday, index));
  }

  protected setStart(weekday: number, index: number, startTime: string): void {
    this.changed.emit(editRange(this.draft(), weekday, index, { startTime }));
  }

  protected setEnd(weekday: number, index: number, endTime: string): void {
    this.changed.emit(editRange(this.draft(), weekday, index, { endTime }));
  }

  protected copyToWeekdays(weekday: number): void {
    this.changed.emit(copyToWeekdays(this.draft(), weekday));
  }

  protected clearDay(weekday: number): void {
    this.changed.emit(clearDay(this.draft(), weekday));
  }
}
