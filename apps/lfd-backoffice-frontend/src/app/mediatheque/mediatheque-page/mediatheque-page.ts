import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MEDIA_LIMITS } from '@lfd/pim-contracts';
import type {
  LibraryMediaView,
  MediaDetailsPayload,
  MediaTagView,
  MediaUploadFailureView,
} from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldFileDropzoneComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
  FoldToastComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { CanDirective } from '../../shared/can/can.directive';

import { BatchUploadStore } from '../batch-upload';
import { FeedTail, type FeedTailState } from '../feed-tail/feed-tail';
import { MediaFeedStore } from '../media-feed';
import {
  ALL_MEDIA,
  isFiltering,
  readCriteria,
  sameCriteria,
  toQueryParams,
  withoutFilters,
  type MediaFeedCriteria,
} from '../media-feed-url';
import { MediaToolbar } from '../media-toolbar/media-toolbar';
import { feedRows } from '../month-dividers';
import { CarriersPanel, type CarriersPanelData } from '../carriers-panel/carriers-panel';
import {
  type ImageDescription,
  ImagePanel,
  type ImagePanelData,
  type ImagePanelResult,
} from '../image-panel/image-panel';
import { TagChip } from '../tag-chip/tag-chip';
import { TagPaletteStore, type PaletteTag } from '../tag-palette';
import {
  TagRemovePanel,
  imagesLabel,
  type TagRemovePanelData,
} from '../tag-remove-panel/tag-remove-panel';
import {
  TagRenamePanel,
  type TagRenamePanelData,
  type TagRenamePanelResult,
} from '../tag-rename-panel/tag-rename-panel';
import { MediaLibraryHttpApi } from '../media-library-http-api';
import { FoldPanelHostService } from 'fold-ng';

/** Le temps laissé pour annuler un retrait sur tuile (D1). Le compte à rebours
 *  de `fold-toast` se met en pause sous le pointeur ou le clavier. */
const UNDO_MS = 6000;

/** Un retrait sur tuile qu'on peut encore annuler. `id` rejoue le compte à rebours. */
interface StrippedTag {
  readonly id: number;
  readonly url: string;
  readonly tag: string;
  /** Sa place dans la liste de l'image : l'annulation le remet où il était. */
  readonly index: number;
}

/**
 * **La médiathèque** — le fonds d'images, indépendamment de ce qui l'affiche.
 *
 * Écran de premier niveau, et pas une vue du référentiel : les fiches portent
 * des visuels, les familles aussi, et les contenus de la vitrine en porteront.
 * Aucun d'eux ne possède la bibliothèque.
 *
 * 🔴 Ce que cet écran ne fait PAS, et qu'il ne faut pas lui ajouter par
 * commodité : dédoublonner. Le serveur groupe par URL — la seule identité qui
 * traverse deux enregistrements de fiche — et une seconde règle de groupement
 * ici finirait par ne plus dire la même chose que la première.
 */
@Component({
  selector: 'app-mediatheque-page',
  imports: [
    CanDirective,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldFileDropzoneComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldPopoverTriggerDirective,
    FoldSearchComponent,
    FoldToastComponent,
    FeedTail,
    MediaToolbar,
    TagChip,
  ],
  templateUrl: './mediatheque-page.html',
  styleUrl: './mediatheque-page.scss',
  // Fourni par la PAGE et non à la racine : un compte rendu de dépôt appartient
  // à l'écran qui l'a lancé, et le quitter doit l'oublier.
  providers: [BatchUploadStore, MediaFeedStore, TagPaletteStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediathequePage {
  private readonly api = inject(MediaLibraryHttpApi);
  protected readonly batch = inject(BatchUploadStore);
  protected readonly palette = inject(TagPaletteStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly feed = inject(MediaFeedStore);

  protected readonly undoMs = UNDO_MS;
  /** Le dernier retrait sur tuile, tant qu'on peut l'annuler. Un seul à la fois. */
  protected readonly stripped = signal<readonly StrippedTag[]>([]);
  private strips = 0;

  /** Ce qu'on tape dans « Nouveau mot-clé ». */
  protected readonly coinDraft = signal('');

  /**
   * Ce que la grille montre — le tri et les filtres, **tels que l'adresse les
   * porte** (plan L2, point 5). Un lien partagé rouvre la même vue.
   *
   * 🔴 Tout part au SERVEUR : filtrer ce qui est chargé ne cherche pas, ça trie
   * un échantillon — une image non chargée était introuvable quoi qu'on tape
   * (corrigé le 2026-09-23).
   */
  protected readonly criteria = signal<MediaFeedCriteria>(ALL_MEDIA);

  /** La grille avec ses intercalaires de mois — sous le tri par dépôt seulement. */
  protected readonly rows = computed(() => feedRows(this.feed.items(), this.criteria().sort));

  protected readonly filtering = computed(() => isFiltering(this.criteria()));

  /** Ce que le bas de la grille dit. Un échec se dit au-dessus, pas ici. */
  protected readonly tail = computed<FeedTailState>(() => {
    if (this.feed.failure() !== null) {
      return 'idle';
    }
    if (this.feed.loading()) {
      return 'loading';
    }
    if (this.feed.hasMore()) {
      return 'more';
    }
    return this.feed.ended() ? 'end' : 'idle';
  });

  /**
   * **Ce qui n'est pas entré**, relu du serveur.
   *
   * 🔴 Distinct de `batch.entries()`, qui est la file de CE lot-ci : celle-là
   * vit en mémoire et s'efface quand on ferme l'onglet, celui-ci survit. Les
   * deux cohabitent parce qu'ils répondent à deux questions — « où en est mon
   * import » et « qu'est-ce qui n'est pas entré ».
   *
   * ⚠️ On ne propose PAS « réessayer » ici : un fichier refusé n'a pas été
   * stocké, donc il n'y a pas d'octets à renvoyer. Seule la file en mémoire,
   * qui détient les `File`, peut le faire.
   */
  /**
   * **Ce que le dépôt accepte**, dit AVANT qu'on essaie.
   *
   * 🔴 L'écran n'en disait rien : le seul moyen d'apprendre qu'un fichier est
   * trop lourd était de se le faire refuser — et sur un lot de cinquante, de
   * découvrir la règle cinquante fois.
   *
   * ⚠️ Lu du CONTRAT, jamais recopié. Une borne annoncée à l'écran et une
   * borne appliquée au serveur ne peuvent pas vivre à deux endroits : l'un des
   * deux finit par mentir, et c'est toujours celui qui ne refuse rien.
   *
   * ⚠️ La garde de TRANSPORT (25 Mo) n'est pas annoncée : ce n'est pas une
   * règle mais une protection, elle coupe bien plus haut, et la dire ferait
   * deux chiffres pour une seule question.
   */
  protected readonly limits = {
    accept: MEDIA_LIMITS.accept,
    formats: MEDIA_LIMITS.formatLabels.join(' · '),
    maxSize: `${String(MEDIA_LIMITS.maxBytes / (1024 * 1024))} Mo`,
    minEdge: `${String(MEDIA_LIMITS.minEdgePixels)} × ${String(MEDIA_LIMITS.minEdgePixels)} px`,
  };

  protected readonly pastFailures = signal<readonly MediaUploadFailureView[]>([]);
  protected readonly showPast = signal(false);

  constructor() {
    // La première émission ouvre l'écran ; les suivantes ne relisent que si
    // l'adresse dit autre chose que l'écran (Précédent, un lien collé). Celles
    // que l'écran provoque lui-même disent la même chose, et ne relisent pas
    // une seconde fois — patron de `admin/journal/journal-page.ts`.
    let opened = false;
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const criteria = readCriteria(params);
      if (opened && sameCriteria(criteria, this.criteria())) {
        return;
      }
      opened = true;
      this.criteria.set(criteria);
      void this.feed.restart(criteria);
    });
    void this.palette.refresh();
  }

  /**
   * Pose de nouveaux critères : l'adresse d'abord, puis une lecture **depuis
   * le début** — un curseur ne survit pas à un changement de critère.
   */
  protected async show(criteria: MediaFeedCriteria): Promise<void> {
    if (sameCriteria(criteria, this.criteria())) {
      return;
    }
    this.criteria.set(criteria);
    this.syncUrl();
    await this.feed.restart(criteria);
  }

  /**
   * `replaceUrl` : un filtre qu'on essaie n'est pas une page qu'on visite, et
   * « Précédent » doit ramener d'où l'on vient.
   */
  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toQueryParams(this.criteria()),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Ouvre — ou referme — l'historique des refus, en le relisant à l'ouverture.
   *
   * Relu à chaque ouverture plutôt que chargé avec la page : personne ne le
   * consulte à chaque visite, et le charger d'office coûterait une requête à
   * tout le monde pour servir quelques-uns.
   */
  protected async togglePast(): Promise<void> {
    const opening = !this.showPast();
    this.showPast.set(opening);
    if (!opening) {
      return;
    }
    try {
      this.pastFailures.set(await this.api.failures());
    } catch {
      // Muet et vide : un historique illisible n'est pas une panne de la
      // médiathèque, et rougir ici ferait croire que le fonds est en cause.
      this.pastFailures.set([]);
    }
  }

  /** La date d'un refus, lisible — l'ISO du serveur ne se lit pas. */
  protected whenOf(failure: MediaUploadFailureView): string {
    return new Date(failure.occurredAt).toLocaleString('fr-FR');
  }

  /** Retient ou relâche un mot-clé du filtre. Retenir RESTREINT. */
  protected async toggleFilterTag(tag: string): Promise<void> {
    const kept = this.criteria().tags;
    await this.show({
      ...this.criteria(),
      tags: kept.includes(tag) ? kept.filter((other) => other !== tag) : [...kept, tag],
    });
  }

  protected isFiltering(tag: string): boolean {
    return this.criteria().tags.includes(tag);
  }

  protected async clearFilter(): Promise<void> {
    await this.show(withoutFilters(this.criteria()));
  }

  /**
   * Ouvre la liste des porteurs d'une image.
   *
   * 🔴 C'est ce qui rend le refus de suppression actionnable : le compteur
   * disait « 3 emplois » sans permettre d'en trouver un seul, donc empêchait
   * le geste sans donner de quoi le débloquer.
   */
  protected showCarriers(item: LibraryMediaView): void {
    void this.panels.open<CarriersPanelData, void>(CarriersPanel, {
      data: { url: item.url, label: this.label(item) },
    });
  }

  /**
   * Ce que l'image porte, dit en toutes lettres.
   *
   * 🔴 Le compte d'emplois est affiché AVANT toute proposition de suppression,
   * et c'est le seul point de cet écran qui n'est pas décoratif : on ne
   * supprime pas une image qu'un porteur affiche, et la base le refuse. Sans
   * cette phrase, la règle s'apprendrait par un échec.
   */
  protected usesLabel(item: LibraryMediaView): string {
    if (item.uses === 0) {
      return 'Inutilisée';
    }
    return item.uses === 1 ? '1 emploi' : `${String(item.uses)} emplois`;
  }

  /** L'étiquette, ou l'aveu qu'elle manque — jamais un vide qu'on lit mal. */
  protected label(item: LibraryMediaView): string {
    return item.name === '' ? 'Sans nom' : item.name;
  }

  /** Le nom de fichier, pour reconnaître une image qu'on n'a pas nommée. */
  protected fileOf(item: LibraryMediaView): string {
    return item.url.split('/').at(-1) ?? item.url;
  }

  /**
   * Dépose la sélection, puis relit la bibliothèque **une seule fois**.
   *
   * Relire après chaque fichier ferait N requêtes et un écran qui saute à
   * chaque image. Le compte rendu du lot dit déjà où en est chacun ; la grille
   * n'a besoin d'être juste qu'à la fin.
   *
   * 🔴 On relit depuis le DÉBUT : une image déposée peut apparaître n'importe
   * où dans l'ordre — la bibliothèque trie par premier dépôt, et redéposer des
   * octets déjà connus ne crée pas d'entrée neuve. Ajouter une page à la suite
   * laisserait la grille mentir.
   */
  /**
   * Dépose une sélection — ou un glisser-déposer.
   *
   * 🔴 Par `fold-file-dropzone` depuis le 2026-09-23. C'était un `<label>` et
   * un `<input type="file">` masqué, sous un commentaire qui disait « fold n'en
   * propose pas » : c'était faux, et ça l'était déjà quand la phrase a été
   * écrite. Le composant existe, il accepte le glisser-déposer, il porte son
   * état d'attente — et il remet sa sélection à zéro tout seul, ce que le
   * contrôle fait main devait faire à la main sous peine de paraître cassé au
   * second dépôt du même fichier.
   */
  protected async deposit(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    if ((await this.batch.send(files)) > 0) {
      await this.reload();
    }
  }

  /** Rejoue les refusés, et relit si quelque chose est passé. */
  protected async retry(): Promise<void> {
    if ((await this.batch.retry()) > 0) {
      await this.reload();
    }
  }

  /** Relit depuis le début, sous les mêmes critères. */
  private async reload(): Promise<void> {
    await this.feed.restart(this.criteria());
  }

  /** Le tag saisi dans la bande rejoint le vocabulaire et s'arme. */
  protected coin(): void {
    if (this.palette.draft(this.coinDraft()) !== null) {
      this.coinDraft.set('');
    }
  }

  /**
   * Pose sur une image le tag qu'on lui amène.
   *
   * 🔴 On renvoie `name` et `focal` INCHANGÉS : l'écriture est un
   * remplacement, pas une retouche. Ne poster que les tags les effacerait.
   *
   * Le geste est idempotent — une image qui porte déjà le mot n'appelle pas le
   * serveur. Sans cette garde, glisser deux fois de suite écrirait deux fois la
   * même chose, et chaque relâché coûterait un aller-retour.
   */
  protected async apply(item: LibraryMediaView, tag: string | null): Promise<void> {
    if (tag === null || item.tags.includes(tag)) {
      return;
    }
    const tags = [...item.tags, tag];
    // L'écran bascule d'abord : reposer un mot-clé ne mérite pas d'attendre le
    // réseau, et l'échec se rattrape en le reposant.
    this.replace({ ...item, tags });
    try {
      await this.api.describe(tagsOnly(item, tags));
      await this.palette.refresh();
    } catch (caught) {
      // Un toast et pas `failure` : la grille reste juste, seul ce geste a
      // échoué. `failure` remplacerait toute la grille par « illisible ».
      this.replace(item);
      this.notify.refused(caught, "Le mot-clé n'a pas pu être posé.");
    }
  }

  /**
   * Retire un mot d'une image — immédiat, puis « Annuler » quelques secondes
   * (D1, Hugo 2026-10-10). Même remplacement, même repli que {@link apply}.
   */
  protected async strip(item: LibraryMediaView, tag: string): Promise<void> {
    const index = item.tags.indexOf(tag);
    const tags = item.tags.filter((kept) => kept !== tag);
    this.replace({ ...item, tags });
    try {
      await this.api.describe(tagsOnly(item, tags));
      this.strips += 1;
      this.stripped.set([{ id: this.strips, url: item.url, tag, index }]);
      await this.palette.refresh();
    } catch (caught) {
      this.replace(item);
      this.notify.refused(caught, "Le mot-clé n'a pas pu être retiré.");
    }
  }

  /**
   * Repose le mot retiré, à sa place, par le même `PUT /media`.
   *
   * Relu sur l'image COURANTE et pas sur celle du retrait : un autre mot a pu
   * être posé entre-temps, et le remplacement l'effacerait.
   */
  protected async undoStrip(last: StrippedTag): Promise<void> {
    this.stripped.set([]);
    const item = this.feed.items().find((entry) => entry.url === last.url);
    if (item === undefined || item.tags.includes(last.tag)) {
      return;
    }
    const tags = [...item.tags];
    tags.splice(Math.min(last.index, tags.length), 0, last.tag);
    this.replace({ ...item, tags });
    try {
      await this.api.describe(tagsOnly(item, tags));
      await this.palette.refresh();
    } catch (caught) {
      this.replace(item);
      this.notify.refused(caught, "Le mot-clé n'a pas pu être reposé.");
    }
  }

  protected dismissStrip(): void {
    this.stripped.set([]);
  }

  /** Le vocabulaire du serveur, tel que les panneaux le comparent. */
  private vocabulary(): readonly MediaTagView[] {
    return this.palette
      .all()
      .filter((entry) => !entry.fresh)
      .map(({ tag, count }) => ({ tag, count }));
  }

  /**
   * Renomme un mot partout — ou le fusionne, si le nouveau existe déjà. Le
   * panneau l'annonce avant ; ici, on écrit, puis on relit la bande ET la
   * grille, qui montre les anciens mots.
   */
  protected async rename(entry: PaletteTag): Promise<void> {
    const result = await this.panels.open<TagRenamePanelData, TagRenamePanelResult>(
      TagRenamePanel,
      { data: { tag: { tag: entry.tag, count: entry.count }, vocabulary: this.vocabulary() } },
    ).closed;
    if (result === undefined) {
      return;
    }
    const merged = this.vocabulary().some((known) => known.tag === result.to);
    try {
      await this.palette.rename(entry.tag, result.to);
    } catch (caught) {
      this.notify.refused(caught, "Le mot-clé n'a pas pu être renommé.");
      return;
    }
    this.notify.success(merged ? 'Mots-clés fusionnés' : 'Mot-clé renommé');
    await this.followFilter(
      this.criteria().tags.map((kept) => (kept === entry.tag ? result.to : kept)),
    );
  }

  /** Retire un mot de tout le fonds, après une confirmation qui donne le compte. */
  protected async removeEverywhere(entry: PaletteTag): Promise<void> {
    const confirmed = await this.panels.open<TagRemovePanelData, true>(TagRemovePanel, {
      data: { tag: { tag: entry.tag, count: entry.count } },
    }).closed;
    if (confirmed !== true) {
      return;
    }
    try {
      await this.palette.remove(entry.tag);
    } catch (caught) {
      this.notify.refused(caught, "Le mot-clé n'a pas pu être retiré.");
      return;
    }
    this.notify.success(`Mot-clé retiré de ${imagesLabel(entry.count)}`);
    await this.followFilter(this.criteria().tags.filter((kept) => kept !== entry.tag));
  }

  /**
   * Le filtre suit le mot renommé ou retiré, puis la grille est relue — même
   * si le filtre n'a pas bougé : elle montre encore l'ancien mot.
   */
  private async followFilter(tags: readonly string[]): Promise<void> {
    const next = { ...this.criteria(), tags: [...new Set(tags)] };
    if (sameCriteria(next, this.criteria())) {
      await this.reload();
      return;
    }
    await this.show(next);
  }

  /** Le glisser-déposer transporte le MOT, pas un index : la bande peut être
   *  refiltrée entre la prise et le relâché. */
  protected carry(event: DragEvent, tag: string): void {
    event.dataTransfer?.setData('text/plain', tag);
  }

  protected async drop(event: DragEvent, item: LibraryMediaView): Promise<void> {
    event.preventDefault();
    await this.apply(item, event.dataTransfer?.getData('text/plain') ?? null);
  }

  private replace(item: LibraryMediaView): void {
    this.feed.replace(item);
  }

  /**
   * Retire une image du fonds, après confirmation.
   *
   * 🔴 **L'écran ne décide pas** : il demande, le serveur refuse s'il faut, et
   * le refus s'affiche tel quel — il nomme le nombre de fiches. Recopier la
   * règle ici ferait deux sources pour un seul fait, et celle de l'écran
   * vieillirait la première.
   *
   * ⚠️ La confirmation ne porte PAS sur la réversibilité : redéposer le même
   * fichier retombe sur la même URL, donc l'image revient. Ce qui ne revient
   * pas, ce sont ses mots-clés, son étiquette et son point — et c'est ça que
   * le message annonce.
   */
  protected async discard(item: LibraryMediaView): Promise<void> {
    const kept = this.label(item);
    if (!confirm(`Retirer « ${kept} » ? Ses mots-clés et son point focal seront perdus.`)) {
      return;
    }
    try {
      await this.api.discard(item.url);
      this.feed.drop(item.url);
    } catch (caught) {
      // Le refus du serveur porte le NOMBRE de fiches ; `message` vaudrait
      // « Http failure response … : 409 » et ferait chercher lesquelles.
      // Un toast et pas l'état d'échec : la grille reste juste.
      this.notify.refused(caught, "L'image n'a pas pu être retirée.");
    }
  }

  /**
   * Ouvre le panneau qui DÉCRIT l'image — étiquette, alternatives, point focal.
   *
   * 🔴 C'est le seul point où ces trois champs s'écrivent. Ils se saisissaient
   * depuis la fiche produit jusqu'au 2026-09-23 ; une image étant partagée, une
   * correction faite là-bas changeait silencieusement ce qu'une autre fiche
   * affichait.
   *
   * Les mots-clés y sont depuis le 2026-10-10 (L1) : la bande pose UN mot sur
   * beaucoup d'images, le panneau règle TOUS ceux d'une image.
   */
  protected describe(item: LibraryMediaView): void {
    void this.panels
      .open<ImagePanelData, ImagePanelResult>(ImagePanel, {
        data: {
          ...describedImage(item),
          vocabulary: this.palette.words(),
          // Le fil CHARGÉ, relu à chaque pas : décrire une série sans refermer.
          sequence: {
            images: () => this.feed.items().map(describedImage),
            save: (result) => this.writeDescription(result),
          },
          showCarriers: (url) => {
            const carrier = this.feed.items().find((entry) => entry.url === url);
            if (carrier !== undefined) {
              this.showCarriers(carrier);
            }
          },
        },
      })
      .closed.then(async (result) => {
        if (result !== undefined) {
          await this.writeDescription(result);
        }
      });
  }

  /**
   * Écrit ce que le panneau a décrit — à l'avance dans le fil, puis au
   * serveur ; un refus remet l'image telle qu'elle était. Rend `false` sur
   * refus : le panneau qui navigue reste alors sur l'image.
   */
  private async writeDescription(result: ImagePanelResult): Promise<boolean> {
    const item = this.feed.items().find((entry) => entry.url === result.url);
    if (item === undefined) {
      return false;
    }
    this.replace({
      ...item,
      name: result.name,
      alt: result.alt,
      focal: result.focal,
      tags: result.tags,
    });
    try {
      await this.api.describe({
        url: item.url,
        name: result.name,
        tags: [...result.tags],
        // Une source vide veut dire « pas d'alternative » : le contrat la
        // refuserait, et le serveur retombe sur l'URL quand elle est
        // absente. On l'omet plutôt que d'envoyer un texte sans sa langue.
        ...(result.alt.fr.trim() === '' ? {} : { alt: result.alt }),
        focal: result.focal,
      });
      await this.palette.refresh();
      return true;
    } catch (caught) {
      this.replace(item);
      this.notify.refused(caught, "L'image n'a pas pu être décrite.");
      return false;
    }
  }
}

/** Ce que le panneau lit d'une image du fil. */
function describedImage(item: LibraryMediaView): ImageDescription {
  return {
    url: item.url,
    name: item.name,
    alt: item.alt,
    focal: item.focal,
    tags: item.tags,
    facts: {
      width: item.width,
      height: item.height,
      bytes: item.bytes,
      contentType: item.contentType,
      depositedAt: item.depositedAt,
      uses: item.uses,
    },
  };
}

/**
 * Le corps d'un geste qui ne touche QUE les mots-clés.
 *
 * 🔴 Il renvoie l'alternative telle qu'elle est. Le serveur lit une
 * alternative ABSENTE comme « effacée » et retombe sur l'URL — c'est ce que
 * fait le panneau quand on vide le champ. Ces trois gestes l'omettaient : poser
 * ou retirer un mot depuis la bande effaçait la description de l'image
 * (corrigé le 2026-10-10).
 */
function tagsOnly(item: LibraryMediaView, tags: readonly string[]): MediaDetailsPayload {
  return { url: item.url, name: item.name, tags: [...tags], alt: item.alt, focal: item.focal };
}
