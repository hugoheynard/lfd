import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  FoldLoadingStateComponent,
  type FoldSelectItem,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { CatalogItemView, ProductionWorksheetView, WorkshopLine } from '@lfd/contracts';

import { AdminCatalogService } from '../../commandes/catalog.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import {
  dayLabelOf,
  hourLabel,
  isoDay,
  nextDay,
  markKey,
  withLocalMarks,
  withoutRefused,
  type LocalMark,
} from '../worksheet-day';
import { worksheetGroups, type WorksheetGroup } from '../worksheet-groups';
import { WorksheetQueue } from '../worksheet-queue';
import { WorksheetService } from '../worksheet.service';
import { DriftBanner } from './drift-banner/drift-banner';
import { WorksheetLine } from './worksheet-line/worksheet-line';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * 🔴 **Le seuil du fournil — 1024 px, pas les 640 px du back-office.**
 *
 * La bascule est structurelle, pas cosmétique : au-dessus, les onglets de
 * catégorie et la colonne d'initiales tiennent ; en dessous, les onglets
 * deviennent un menu qu'on ouvre par erreur les mains sales. C'est la largeur
 * où la barre d'onglets cesse de tenir sur une ligne qui décide.
 *
 * ⚠️ La même valeur est écrite dans `fiche-atelier.scss` (une media query ne lit
 * pas un `const`). Les deux bougent ensemble ou l'écran se coupe en deux.
 */
const WORKSHOP_NARROW = '(max-width: 1023px)';

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Aucun prix, aucun nom de client, aucun total en euros : ce n'est pas une
 * omission, c'est la règle qui définit cet écran, et le contrat la porte dans le
 * TYPE plutôt qu'en consigne — il n'y a pas de champ à laisser vide.
 *
 * **Deux supports, une seule liste.** Le poste fixe montre les fiches en
 * onglets ; le téléphone en montre une, choisie à l'entrée, et fait descendre
 * les lignes faites dans un bloc replié épinglé au-dessus du pied. Ce qui change
 * est **ce que le support enlève** — jamais la ligne, qui est le geste qu'on
 * répète neuf fois.
 *
 * **La coche s'écrit à l'écran d'abord.** Le fournil est en sous-sol : cocher
 * pose l'état ici, puis le confie à {@link WorksheetQueue}. Le pied dit toujours
 * combien de gestes attendent — 🔴 jamais un écran qui a l'air d'avoir
 * enregistré alors que non.
 *
 * **La catégorie ouverte suit la PERSONNE**, dans `nav_prefs` et non dans
 * `localStorage` : le téléphone du pétrin n'est pas la machine du chef, et c'est
 * la personne qui reprend son poste. Un `PATCH` refusé laisse simplement la
 * catégorie à la session.
 */
@Component({
  selector: 'app-fiche-atelier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DriftBanner,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    WorksheetLine,
  ],
  templateUrl: './fiche-atelier.html',
  styleUrl: './fiche-atelier.scss',
})
export class FicheAtelier {
  private readonly api = inject(WorksheetService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly permissions = inject(PermissionsStore);
  private readonly prefs = inject(StaffPrefsService);
  private readonly queue = inject(WorksheetQueue);

  /**
   * 🔴 **La journée que le four est en train de faire** — elle se déduit, elle
   * ne se choisit pas.
   *
   * La règle, décidée le 2026-09-13 : **demain dès que le plan de demain est
   * arrêté, aujourd'hui sinon.** C'est le geste du soir qui fait basculer
   * l'écran : on arrête le plan du lendemain au prévisionnel, et à partir de cet
   * instant la fiche montre ce que le fournil va sortir — il commence à 4 h, et
   * à 4 h « aujourd'hui » n'est plus la bonne réponse.
   *
   * Ni « aujourd'hui » ni « demain » en dur, donc, et c'est tout l'intérêt : les
   * deux étaient faux la moitié du temps. « Aujourd'hui » laissait le fournil de
   * la nuit sur la journée qui vient de finir ; « demain » le faisait cocher une
   * fiche qui n'existe pas encore.
   *
   * Pas de sélecteur, délibérément : c'est l'écran qu'un poste garde allumé
   * toute la fournée, et la seule question qu'on s'y pose est « qu'est-ce qui
   * reste à sortir ». En contrepartie, l'écran NOMME sa journée en toutes
   * lettres — une fiche sans sélecteur doit dire de quel jour elle parle.
   */
  protected readonly date = signal(isoDay(new Date()));

  /** « samedi 16 août » — l'en-tête de la fiche. */
  protected readonly dayLabel = computed(() => dayLabelOf(this.date()));

  /**
   * « aujourd'hui » ou « demain », à côté de la date.
   *
   * 🔴 La fiche n'a pas de sélecteur, et sa journée **se déduit** — elle bascule
   * sur demain dès que le plan de demain est arrêté. Le fournil n'a donc aucun
   * moyen de savoir quel jour il coche, sauf à lire la date et à la comparer
   * mentalement à celle d'aujourd'hui, à 4 h du matin. Se tromper d'un jour est
   * l'erreur la plus chère que cet écran puisse coûter : on fabrique pour rien,
   * et ce qui était dû manque.
   *
   * Vide en dehors de ces deux cas — la fiche ne montre jamais une autre
   * journée, et un troisième mot suggérerait qu'elle le pourrait.
   */
  protected readonly dayOffset = computed(() => {
    const day = this.date();
    if (day === isoDay(new Date())) {
      return 'aujourd’hui';
    }
    return day === isoDay(nextDay(new Date())) ? 'demain' : '';
  });

  protected readonly state = signal<LoadState>('loading');
  protected readonly compact = narrowViewport(WORKSHOP_NARROW);

  private readonly sheet = signal<ProductionWorksheetView | null>(null);
  private readonly catalogue = signal<readonly CatalogItemView[]>([]);

  /**
   * 🔴 La lecture du catalogue a-t-elle échoué ?
   *
   * Elle ne fait pas tomber la fiche — les quantités viennent de la production,
   * pas d'elle — mais elle ne peut pas passer en silence : sans catalogue, chaque
   * SKU tombe dans le groupe sans rayon, et un libellé « Hors catalogue »
   * affirmerait que le fournil fabrique des articles retirés de la vente.
   */
  protected readonly shelvesLost = signal(false);

  /** Le retirage vient-il d'échouer ? Un échec partiel, la fiche reste à l'écran. */
  protected readonly retakeFailed = signal(false);

  /** Les coches posées ici, par `AAAA-MM-JJ SKU`. Elles l'emportent sur le serveur. */
  private readonly localMarks = signal<ReadonlyMap<string, LocalMark>>(new Map());

  /** Le bloc des lignes faites, sur téléphone. Replié : on vient voir ce qui reste. */
  protected readonly doneOpen = signal(false);

  /** La fiche choisie. `null` tant que rien n'a été lu ni préféré. */
  private readonly chosen = signal<string | null>(null);

  protected readonly pendingMarks = this.queue.pending;
  protected readonly offline = this.queue.offline;

  /**
   * Les coches refusées pour de bon, **nommées** : le SKU seul ne dit rien à qui
   * a les mains dans la pâte, le nom du produit si.
   */
  protected readonly refusals = computed(() => {
    const lines = this.sheet()?.lines ?? [];
    return this.queue.rejected().map(({ mark, message }) => ({
      key: markKey(mark.date, mark.sku),
      label: lines.find((line) => line.sku === mark.sku)?.productName ?? mark.sku,
      message,
    }));
  });

  constructor() {
    // 🔴 Une lecture UNIQUE, et pas un `effect` sur la journée. L'écran n'a pas
    // de sélecteur de date : le seul à écrire `date` est `load` lui-même, donc
    // un effet qui la lirait se rappellerait après chaque lecture — et le jour
    // où la règle bascule d'aujourd'hui à demain, il partirait deux fois.
    void this.load();
    // La préférence n'arrive pas avant la personne : `GET /admin/me` est déjà en
    // vol pour les droits, on ne le redemande pas. Si elle n'arrive jamais, la
    // première fiche de la liste fait très bien l'affaire.
    void this.prefs.worksheetCategory().then((category) => {
      if (category !== null && this.chosen() === null) {
        this.chosen.set(category);
      }
    });
  }

  /** Les lignes du serveur, recouvertes par ce qui a été coché ici. */
  private readonly lines = computed<readonly WorkshopLine[]>(() => {
    const sheet = this.sheet();
    return sheet === null
      ? []
      : withLocalMarks(
          sheet.lines,
          sheet.date,
          withoutRefused(this.localMarks(), this.queue.rejected()),
        );
  });

  protected readonly groups = computed(() =>
    worksheetGroups(this.lines(), this.catalogue(), !this.shelvesLost()),
  );

  /** La fiche affichée : celle qu'on a choisie, ou la première s'il n'y a pas de choix. */
  protected readonly current = computed<WorksheetGroup | null>(() => {
    const groups = this.groups();
    const key = this.chosen();
    return groups.find((group) => group.key === key) ?? groups[0] ?? null;
  });

  /** Le rang de la fiche dans la liste — « fiche 2 sur 5 ». */
  protected readonly rank = computed(() => {
    const current = this.current();
    return current === null ? 0 : this.groups().indexOf(current) + 1;
  });

  /** Les onglets du poste fixe : le rayon et son avancement. */
  protected readonly tabs = computed<readonly FoldViewToggleOption[]>(() =>
    this.groups().map((group) => ({
      value: group.key,
      label: `${group.label} ${group.doneCount}/${group.lines.length}`,
    })),
  );

  /** Le même choix, sous le pouce : une liste, jamais six onglets de 390 px. */
  protected readonly tabOptions = computed<readonly FoldSelectItem<string>[]>(() =>
    this.groups().map((group) => ({
      value: group.key,
      label: `${group.label} · ${group.doneCount}/${group.lines.length}`,
    })),
  );

  /** Ce qui reste à faire, dans l'ordre de la fiche. */
  protected readonly todo = computed(() => (this.current()?.lines ?? []).filter((l) => !l.done));

  /** Ce qui est sorti — sur téléphone, dans le bloc replié épinglé au pied. */
  protected readonly done = computed(() => (this.current()?.lines ?? []).filter((l) => l.done));

  protected readonly donePieces = computed(() =>
    this.done().reduce((sum, line) => sum + line.quantity, 0),
  );

  /** « 4 h 05 », l'heure du tirage. `null` = le plan n'est pas arrêté. */
  protected readonly generatedLabel = computed(() => hourLabel(this.sheet()?.generatedAt ?? null));

  /** L'heure du dernier retirage, si la journée en a connu un. */
  protected readonly retakenLabel = computed(() => hourLabel(this.sheet()?.retakenAt ?? null));

  protected readonly drift = computed(() => this.sheet()?.drift ?? null);

  protected async load(date?: string): Promise<void> {
    this.state.set('loading');
    this.retakeFailed.set(false);
    try {
      // Le catalogue part avec la fiche : sans lui, pas de rayons, donc pas de
      // postes. Une lecture ratée ne doit pas faire disparaître la production,
      // mais elle ne doit pas se taire non plus.
      const [served, catalogue] = await Promise.all([
        date === undefined ? this.workedDay() : this.api.worksheet(date),
        this.catalog.list().catch(() => null),
      ]);
      this.sheet.set(served);
      // La journée vient de la RÉPONSE, pas de la demande : `workedDay` peut
      // rendre demain là où on avait aujourd'hui, et l'en-tête doit nommer la
      // fiche qu'on lit, jamais celle qu'on a demandée.
      this.date.set(served.date);
      this.shelvesLost.set(catalogue === null);
      this.catalogue.set(catalogue ?? []);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * **La fiche que le four est en train de faire** : demain si son plan est
   * arrêté, aujourd'hui sinon.
   *
   * Deux lectures dans le pire des cas, et une seule dans le cas courant — celui
   * du fournil de la nuit, qui trouve le plan du lendemain déjà arrêté. On
   * demande donc demain D'ABORD : la journée qui a un tirage est celle qu'on
   * fabrique, et un tirage est précisément ce qu'« arrêté » veut dire.
   *
   * ⚠️ On ne devine pas à partir de l'heure du poste. Une bascule à minuit, ou à
   * 16 h, serait une règle de plus à connaître — et fausse le jour où le fournil
   * décale son service. Ici c'est le GESTE qui fait basculer l'écran, et ce
   * geste est déjà celui que l'équipe fait.
   */
  private async workedDay(): Promise<ProductionWorksheetView> {
    const tomorrow = await this.api.worksheet(isoDay(nextDay(new Date())));
    return tomorrow.generatedAt === null ? this.api.worksheet(isoDay(new Date())) : tomorrow;
  }

  /** Change de fiche, et le retient pour la personne. */
  protected choose(key: string): void {
    this.chosen.set(key);
    this.doneOpen.set(false);
    void this.prefs.remember({ worksheetCategory: key });
  }

  /**
   * Coche ou décoche une ligne : **à l'écran d'abord**, puis dans la file.
   *
   * Rien n'attend ici la réponse du serveur. Une case qui mettrait deux secondes
   * à noircir au sous-sol serait recochée une seconde fois, et ce sont les deux
   * gestes contradictoires que la file existe pour éviter.
   */
  protected toggle(line: WorkshopLine, done: boolean): void {
    const date = this.sheet()?.date ?? this.date();
    const initials = this.initials();
    const next = new Map(this.localMarks());
    next.set(markKey(date, line.sku), { done, initials });
    this.localMarks.set(next);
    this.queue.mark({ date, sku: line.sku, done, initials });
  }

  /** Absorbe ce qui est arrivé depuis le tirage, puis relit la fiche. */
  protected async retake(): Promise<void> {
    this.retakeFailed.set(false);
    try {
      await this.api.retake(this.date());
    } catch {
      this.retakeFailed.set(true);
      return;
    }
    await this.load();
  }

  /**
   * La personne a vu les refus. Les coches locales correspondantes sont
   * **retirées pour de bon** avant qu'on oublie le refus : sans ça, elles
   * réapparaîtraient cochées à l'instant où le filtre des refus se lève.
   */
  protected acknowledgeRefusals(): void {
    const next = new Map(this.localMarks());
    for (const { mark } of this.queue.rejected()) {
      next.delete(markKey(mark.date, mark.sku));
    }
    this.localMarks.set(next);
    this.queue.acknowledge();
  }

  protected toggleDone(): void {
    this.doneOpen.update((open) => !open);
  }

  /**
   * Les initiales de qui coche, prises sur la personne connectée.
   *
   * ⚠️ Le plan ne dit pas d'où elles viennent. Les demander à l'écran ferait taper
   * deux lettres les doigts farinés à chaque ligne ; les déduire du nom est la
   * seule source non inventée dont l'écran dispose (tranché le 2026-09-13, à
   * revoir si le fournil signe au nom de son poste et non du sien).
   */
  private initials(): string {
    const me = this.permissions.identity();
    if (me === null) {
      return '';
    }
    return `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();
  }
}
