import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LibraryMediaView, MediaUploadFailureView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { BatchUploadStore } from '../batch-upload';
import { CarriersPanel, type CarriersPanelData } from '../carriers-panel/carriers-panel';
import { ImagePanel, type ImagePanelData, type ImagePanelResult } from '../image-panel/image-panel';
import { TagPaletteStore } from '../tag-palette';
import { MediaLibraryHttpApi } from '../media-library-http-api';
import { FoldPanelHostService } from 'fold-ng';

/** Une page d'aperçus. Le serveur reborne de toute façon à 100. */
const PAGE_SIZE = 60;

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
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './mediatheque-page.html',
  styleUrl: './mediatheque-page.scss',
  // Fourni par la PAGE et non à la racine : un compte rendu de dépôt appartient
  // à l'écran qui l'a lancé, et le quitter doit l'oublier.
  providers: [BatchUploadStore, TagPaletteStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediathequePage {
  private readonly api = inject(MediaLibraryHttpApi);
  protected readonly batch = inject(BatchUploadStore);
  protected readonly palette = inject(TagPaletteStore);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly items = signal<readonly LibraryMediaView[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  /**
   * Le message d'un échec, `null` sinon.
   *
   * Une grille vide et une grille qui n'a pas pu charger se ressemblent à
   * l'écran ; les confondre ferait croire le fonds vide au premier réseau qui
   * tousse.
   */
  protected readonly failure = signal<string | null>(null);

  private readonly offset = signal(0);

  /**
   * Ce qu'on cherche — **envoyé au serveur**, pas appliqué ici.
   *
   * 🔴 Filtrer ce qui est chargé ne cherche pas, ça trie un échantillon : le
   * fonds se parcourt soixante par soixante, donc une image non chargée était
   * introuvable quoi qu'on tape. C'est le défaut que ce champ corrige
   * (2026-09-23).
   */
  protected readonly search = signal('');

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
  protected readonly pastFailures = signal<readonly MediaUploadFailureView[]>([]);
  protected readonly showPast = signal(false);

  /** Les mots-clés retenus — l'image doit les porter TOUS. */
  protected readonly filterTags = signal<readonly string[]>([]);

  protected readonly hasMore = computed(() => this.items().length < this.total());

  constructor() {
    void this.load();
  }

  /** Charge la page suivante et l'ajoute à ce qui est déjà affiché. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    try {
      const page = await this.api.page(PAGE_SIZE, this.offset(), this.search(), this.filterTags());
      this.items.update((current) => [...current, ...page.items]);
      // La bande se recense sur ce qui est chargé : le vocabulaire est DÉRIVÉ
      // de l'usage, il n'a pas de table à lui.
      this.palette.observe(this.items().map((item) => item.tags));
      this.total.set(page.total);
      this.offset.update((current) => current + page.items.length);
    } catch {
      this.failure.set("La bibliothèque n'a pas pu être lue.");
    } finally {
      this.loading.set(false);
    }
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

  /**
   * Relit le fonds **depuis le début** avec le filtre courant.
   *
   * 🔴 Depuis le début, et c'est le point : `load()` AJOUTE à ce qui est
   * affiché, parce qu'il sert « charger plus ». Réutilisé tel quel après un
   * changement de critère, il collerait les résultats du nouveau filtre à la
   * suite de ceux de l'ancien — un écran qui mélange deux recherches.
   */
  protected async refilter(): Promise<void> {
    this.items.set([]);
    this.offset.set(0);
    await this.load();
  }

  /** Retient ou relâche un mot-clé du filtre. Retenir RESTREINT. */
  protected async toggleFilterTag(tag: string): Promise<void> {
    this.filterTags.update((current) =>
      current.includes(tag) ? current.filter((kept) => kept !== tag) : [...current, tag],
    );
    await this.refilter();
  }

  protected isFiltering(tag: string): boolean {
    return this.filterTags().includes(tag);
  }

  /** Y a-t-il un critère posé ? Sert à proposer de l'effacer. */
  protected readonly filtering = computed(
    () => this.search().trim() !== '' || this.filterTags().length > 0,
  );

  protected async clearFilter(): Promise<void> {
    this.search.set('');
    this.filterTags.set([]);
    await this.refilter();
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
      return 'aucun emploi';
    }
    return item.uses === 1 ? '1 emploi' : `${String(item.uses)} emplois`;
  }

  /** L'étiquette, ou l'aveu qu'elle manque — jamais un vide qu'on lit mal. */
  protected label(item: LibraryMediaView): string {
    return item.name === '' ? 'Sans étiquette' : item.name;
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
  protected async deposit(picked: EventTarget | null): Promise<void> {
    const input = picked instanceof HTMLInputElement ? picked : null;
    const files = input === null ? [] : [...(input.files ?? [])];
    if (input !== null) {
      // Remis à zéro TOUT DE SUITE : sans ça, redéposer la même sélection ne
      // déclenche aucun `change`, et l'écran a l'air cassé.
      input.value = '';
    }
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

  private async reload(): Promise<void> {
    this.items.set([]);
    this.offset.set(0);
    await this.load();
  }

  /** Le tag saisi dans la bande rejoint le vocabulaire et s'arme. */
  protected coin(input: EventTarget | null): void {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.palette.draft(input.value) !== null) {
      input.value = '';
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
      await this.api.describe({ url: item.url, name: item.name, tags, focal: item.focal });
      this.palette.observe(this.items().map((entry) => entry.tags));
    } catch {
      this.replace(item);
      this.failure.set("Le mot-clé n'a pas pu être posé.");
    }
  }

  /** Retire un mot d'une image. Même remplacement, même repli. */
  protected async strip(item: LibraryMediaView, tag: string): Promise<void> {
    const tags = item.tags.filter((kept) => kept !== tag);
    this.replace({ ...item, tags });
    try {
      await this.api.describe({ url: item.url, name: item.name, tags, focal: item.focal });
      this.palette.observe(this.items().map((entry) => entry.tags));
    } catch {
      this.replace(item);
      this.failure.set("Le mot-clé n'a pas pu être retiré.");
    }
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
    this.items.update((current) => current.map((entry) => (entry.url === item.url ? item : entry)));
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
    this.failure.set(null);
    try {
      await this.api.discard(item.url);
      this.items.update((current) => current.filter((entry) => entry.url !== item.url));
      this.total.update((current) => Math.max(current - 1, 0));
      this.offset.update((current) => Math.max(current - 1, 0));
    } catch (caught) {
      // Le refus du serveur porte le NOMBRE de fiches ; `message` vaudrait
      // « Http failure response … : 409 » et ferait chercher lesquelles.
      this.failure.set(httpErrorMessage(caught, "L'image n'a pas pu être retirée."));
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
   * Les mots-clés ne sont PAS dans ce panneau : ils se posent à la bande, sur
   * autant d'images qu'on veut. Un geste de fonds et un geste d'unité ne se
   * mélangent pas.
   */
  protected describe(item: LibraryMediaView): void {
    void this.panels
      .open<ImagePanelData, ImagePanelResult>(ImagePanel, {
        data: { url: item.url, name: item.name, alt: item.alt, focal: item.focal },
      })
      .closed.then(async (result) => {
        if (result === undefined) {
          return;
        }
        const written = { ...item, name: result.name, alt: result.alt, focal: result.focal };
        this.replace(written);
        try {
          await this.api.describe({
            url: item.url,
            name: result.name,
            tags: [...item.tags],
            // Une source vide veut dire « pas d'alternative » : le contrat la
            // refuserait, et le serveur retombe sur l'URL quand elle est
            // absente. On l'omet plutôt que d'envoyer un texte sans sa langue.
            ...(result.alt.fr.trim() === '' ? {} : { alt: result.alt }),
            focal: result.focal,
          });
        } catch (caught) {
          this.replace(item);
          this.failure.set(httpErrorMessage(caught, "L'image n'a pas pu être décrite."));
        }
      });
  }
}
