import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { PriceFloorView, PriceMode, PriceScopePayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { formatEuros } from '@lfd/catalog-ui';

import { NotifyService } from '../../../notify.service';
import { ArchivePanel, type ArchivePanelData } from '../archive-panel/archive-panel';
import { JournalPanel, type JournalPanelData } from '../journal-panel/journal-panel';
import { TarificationService } from '../tarification.service';

/** Charge d'ouverture : la portée visée, ce qui y est posé, ce dont elle hérite. */
export interface FloorPanelData {
  readonly scope: PriceScopePayload;
  readonly target: string;
  /** La limite posée sur CETTE portée, ou `null`. */
  readonly current: PriceFloorView | null;
  /** Celle qui s'applique aujourd'hui — la sienne, ou celle dont elle hérite. */
  readonly inherited: PriceFloorView | null;
  /** Le prix canonique, pour montrer ce qu'une fraction donnerait. `null` sur une famille. */
  readonly canonicalCents: number | null;
}

/**
 * Panneau **Limite** — le prix ne descendra pas sous ce seuil.
 *
 * Deux choses que cet écran doit dire, parce qu'elles surprennent :
 *
 * - **poser une limite sur un article REMPLACE celle de sa famille**, elle ne
 *   s'y ajoute pas. Elle peut donc l'abaisser. C'est le geste « cet article est
 *   une exception », et il faut le voir avant de le faire — d'où le rappel de
 *   la limite héritée, juste à côté ;
 * - **une fraction suit le tarif** quand le PIM augmente ; un montant non. Le
 *   pourcentage vaut pour une marge relative, le montant pour un coût fixe connu
 *   (un emballage, une pièce achetée).
 */
@Component({
  selector: 'app-floor-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldInputComponent],
  templateUrl: './floor-panel.html',
  styleUrl: './floor-panel.scss',
})
export class FloorPanel {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly panels = inject(FoldPanelHostService);

  readonly data = input<FloorPanelData | undefined>(undefined);

  protected readonly mode = signal<PriceMode>('amount');

  /**
   * **Une limite en euros n'a de sens que sur une unité.**
   *
   * « Jamais sous 1,50 € » sur une famille laisserait passer une pièce montée à
   * 1,50 € et relèverait un croissant qui se vend 2,00 € : le même mur, deux
   * effets opposés. Une fraction, elle, suit l'article.
   *
   * L'écran ne propose donc pas le choix au-delà d'un article — plutôt que de
   * l'offrir et de le refuser ensuite, ce qui est la façon la plus sûre de faire
   * saisir deux fois la même chose. Le serveur le refuse de son côté : c'est une
   * règle du modèle, pas une commodité de saisie.
   */
  protected readonly unitScoped = computed(() => {
    const type = this.data()?.scope.type;
    return type === 'product' || type === 'variant';
  });
  /** La grandeur telle que saisie : des euros, ou des pourcents. */
  protected readonly amount = signal<number | null>(null);
  protected readonly saving = signal(false);
  private readonly seeded = signal(false);

  /** Centimes → euros, exposé au gabarit. */
  protected readonly euros = formatEuros;

  protected readonly target = computed(() => this.data()?.target ?? '');
  protected readonly current = computed(() => this.data()?.current ?? null);

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
    const months = Math.floor(days / 30);
    return months >= 1 ? `${String(months)} mois` : `${String(days)} jours`;
  });

  /**
   * La limite dont on hérite, **quand ce n'est pas la sienne**. C'est celle-là
   * qu'un remplacement fait sauter, donc c'est celle qu'il faut montrer.
   */
  protected readonly inherited = computed(() => {
    const data = this.data();
    if (data === undefined || data.inherited === null) {
      return null;
    }
    return data.inherited.id === data.current?.id ? null : data.inherited;
  });

  /**
   * Ce qu'une fraction donnerait **sur cet article** — la seule façon de juger
   * un pourcentage. « 50 % » ne dit rien tant qu'on ne voit pas 1,00 €.
   */
  protected readonly preview = computed(() => {
    const canonical = this.data()?.canonicalCents ?? null;
    const value = this.amount();
    if (canonical === null || value === null || this.mode() !== 'percent') {
      return null;
    }
    return formatEuros(Math.round((canonical * value) / 100));
  });

  /** La limite héritée, mise en forme selon son unité. */
  protected readonly inheritedLabel = computed(() => {
    const heritee = this.inherited();
    if (heritee === null) {
      return '';
    }
    return heritee.mode === 'percent'
      ? `${String(heritee.value / 100)} % du tarif`
      : formatEuros(heritee.value);
  });

  constructor() {
    // Amorçage **unique**, comme `lfd-price-alteration-field` : réamorcer à
    // chaque passage remettrait le champ à sa valeur d'origine pendant qu'on est
    // en train de le retaper.
    effect(() => {
      const data = this.data();
      if (data === undefined || untracked(this.seeded)) {
        return;
      }
      this.seeded.set(true);
      // Au-delà d'un article, l'unité n'est pas un choix : le panneau s'ouvre
      // donc directement sur la seule forme qui ait un sens.
      if (!untracked(this.unitScoped)) {
        this.mode.set('percent');
      }
      if (data.current !== null) {
        this.mode.set(data.current.mode);
        this.amount.set(data.current.value / 100);
      }
    });
  }

  protected setMode(mode: PriceMode): void {
    if (mode === 'amount' && !this.unitScoped()) {
      return;
    }
    this.mode.set(mode);
  }

  protected setAmount(value: string): void {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    this.amount.set(value.trim() === '' || Number.isNaN(parsed) ? null : parsed);
  }

  protected readonly canSubmit = computed(() => {
    const value = this.amount();
    if (value === null || value <= 0) {
      return false;
    }
    // Au-delà de 100 %, ce n'est plus un plancher : ça relèverait TOUS les prix,
    // y compris ceux qu'aucune règle n'a touchés. Le serveur le refuse aussi ;
    // le dire ici évite un aller-retour pour une faute évidente.
    return this.mode() !== 'percent' || value <= 100;
  });

  protected async submit(): Promise<void> {
    const scope = this.data()?.scope;
    const value = this.amount();
    if (scope === undefined || value === null || !this.canSubmit() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.tarification.setFloor({
        scope,
        mode: this.mode(),
        value: Math.round(value * 100),
        // Le MUR seul. La porte — un plancher plus bas déverrouillé par le
        // volume — est acceptée par le serveur mais pas encore saisissable ici :
        // envoyer `null` explicitement plutôt que d'omettre le champ, pour que
        // re-poser une limite n'efface pas une porte par inadvertance… et pour
        // que le jour où l'écran la propose, ce soit une décision visible.
        dynamic: null,
      });
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
   * repartent d'aujourd'hui.
   *
   * C'est ce qui éteint le signal. L'alternative — modifier la limite pour faire
   * taire le rappel — reviendrait à changer une décision pour de mauvaises
   * raisons.
   */
  protected async confirm(): Promise<void> {
    const scope = this.data()?.scope;
    if (scope === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.tarification.confirmFloor(scope);
      this.notify.success('Limite confirmée — elle repart pour un tour.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La limite n'a pas pu être confirmée.");
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * **Retirer** ouvre le panneau d'archivage, qui demande pourquoi.
   *
   * Rien n'est effacé : la limite est archivée, la portée retombe sur celle dont
   * elle hérite, et le journal garde qui l'a retirée et pour quelle raison.
   */
  protected retire(): void {
    const data = this.data();
    const current = this.current();
    if (data === undefined || current === null) {
      return;
    }
    this.panels.open<ArchivePanelData, boolean>(ArchivePanel, {
      data: {
        subject: { kind: 'floor', scope: data.scope },
        target: data.target,
        summary: `Limite sur ${data.target} — ${floorSentence(current)}`,
      },
      width: 'md',
    });
  }

  /**
   * **Le journal de cette limite** : qui l'a posée, qui l'a confirmée, quand.
   *
   * Il REMPLACE ce panneau plutôt que de s'empiler dessus — lire l'histoire
   * n'est pas une étape de la saisie, et deux panneaux superposés cacheraient
   * celui qu'on croyait encore ouvert.
   */
  protected openJournal(): void {
    const data = this.data();
    const current = this.current();
    if (data === undefined || current === null) {
      return;
    }
    this.panels.open<JournalPanelData, boolean>(JournalPanel, {
      data: { subjectType: 'floor', subjectId: current.id, target: data.target },
      width: 'md',
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** La limite en une phrase, pour que le panneau d'archivage dise ce qu'il range. */
function floorSentence(floor: PriceFloorView): string {
  return floor.mode === 'amount'
    ? formatEuros(floor.value)
    : `${String(floor.value / 100).replace('.', ',')} % du tarif`;
}
