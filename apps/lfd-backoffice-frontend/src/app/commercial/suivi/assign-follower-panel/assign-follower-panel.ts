import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { SalesOversightFollowerOption } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
  type FoldSelectItem,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { GestureIntents } from '../../../shared/gesture-intents';
import { SalesOversightService } from '../sales-oversight.service';

/** La fiche à confier, qui la suit aujourd'hui, et à qui on peut la confier. */
export interface AssignFollowerPanelData {
  readonly companyId: string;
  readonly companyName: string;
  /** L'id du suiveur actuel, ou `null`. */
  readonly currentFollowerId: string | null;
  readonly assignable: readonly SalesOversightFollowerOption[];
}

/**
 * **Confier le suivi d'une fiche** — choisir le commercial qui la suit, ou
 * retirer le suiveur. Celui qui décide est l'acteur de la requête ; un site,
 * une personne suspendue sont refusés par le serveur, et le refus reste dans
 * le dialogue.
 *
 * La clé d'intention est tenue par fiche ET par choix : un double clic ne
 * réattribue pas deux fois, et changer d'avis après un refus est un autre geste.
 */
@Component({
  selector: 'app-assign-follower-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './assign-follower-panel.html',
  styleUrl: './assign-follower-panel.scss',
})
export class AssignFollowerPanel implements FoldPanelContent<AssignFollowerPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'sm' };

  readonly data = input<AssignFollowerPanelData | undefined>();

  private readonly api = inject(SalesOversightService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject<FoldPanelRef<boolean>>(FoldPanelRef);
  private readonly intents = new GestureIntents();

  readonly chosen = signal<string | null>(null);
  protected readonly pending = signal(false);
  readonly refusal = signal<string | null>(null);

  protected readonly options = computed<readonly FoldSelectItem<string>[]>(() =>
    (this.data()?.assignable ?? [])
      .filter((option) => option.id !== this.data()?.currentFollowerId)
      .map((option) => ({ value: option.id, label: option.name ?? 'Membre sans nom' })),
  );
  protected readonly title = computed(() =>
    this.data()?.currentFollowerId === null ? 'Attribuer la fiche' : 'Réattribuer la fiche',
  );
  protected readonly canRemove = computed(() => (this.data()?.currentFollowerId ?? null) !== null);

  protected cancel(): void {
    this.ref.close(false);
  }

  /** Confie la fiche au commercial choisi. */
  async assign(): Promise<void> {
    const chosen = this.chosen();
    if (chosen === null) return;
    await this.send(chosen);
  }

  /** Retire le suiveur : la fiche redevient « non attribuée ». */
  async remove(): Promise<void> {
    await this.send(null);
  }

  private async send(followerStaffId: string | null): Promise<void> {
    const opened = this.data();
    if (opened === undefined || this.pending()) return;
    const subject = `${opened.companyId}:${followerStaffId ?? 'none'}`;
    this.pending.set(true);
    this.refusal.set(null);
    try {
      await this.api.assignFollower(
        opened.companyId,
        followerStaffId,
        this.intents.keyFor(subject),
      );
      this.intents.done(subject);
      this.notify.success(
        followerStaffId === null
          ? `${opened.companyName} n’a plus de suiveur.`
          : `${opened.companyName} est confiée à ${this.nameOf(followerStaffId)}.`,
      );
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le suivi n’a pas été modifié.'));
    } finally {
      this.pending.set(false);
    }
  }

  private nameOf(staffId: string): string {
    const option = this.data()?.assignable.find((candidate) => candidate.id === staffId);
    return option?.name ?? 'un membre de l’équipe';
  }
}
