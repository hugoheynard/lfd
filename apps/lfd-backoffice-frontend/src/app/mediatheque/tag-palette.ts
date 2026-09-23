import { Injectable, computed, signal } from '@angular/core';

/**
 * **La bande de tags** — le vocabulaire disponible, tenu EN MÉMOIRE.
 *
 * 🔴 Il n'y a pas de table de tags, et ce n'est pas un raccourci : le
 * vocabulaire est libre et à plat (décision Hugo, 2026-09-23), donc un tag n'a
 * rien à porter d'autre que son mot. Le « référentiel » des tags est donc
 * **dérivé** — ce que les images portent déjà — plus ce que quelqu'un vient
 * d'écrire dans la bande sans l'avoir encore posé.
 *
 * Conséquence assumée : un tag créé mais jamais déposé sur une image **ne
 * survit pas** au rechargement. C'est cohérent avec le modèle — un mot que
 * rien ne porte n'existe pas — et ça évite un second endroit où un vocabulaire
 * pourrait diverger de son usage.
 */
@Injectable()
export class TagPaletteStore {
  /**
   * Ce que les images chargées portent déjà.
   *
   * 🔴 **Cumulé, jamais réécrit** (2026-09-23). Il l'était, et c'était sans
   * conséquence tant que l'écran chargeait tout le fonds. Depuis que la
   * recherche filtre au SERVEUR, une réécriture ferait disparaître de la bande
   * les tags absents du résultat — donc, dès qu'on a filtré, on ne pourrait
   * plus élargir ni changer de critère. Une bande qui rétrécit à mesure qu'on
   * s'en sert est un piège.
   */
  private readonly inUse = signal<readonly string[]>([]);
  /** Ce que quelqu'un vient d'écrire et n'a pas encore posé. */
  private readonly drafted = signal<readonly string[]>([]);

  readonly search = signal('');

  /**
   * Le tag ARMÉ — celui qu'un clic sur une image posera.
   *
   * Il double le glisser-déposer plutôt que de le remplacer : on ne glisse pas
   * au clavier, et une bande de tags qu'on ne peut utiliser qu'à la souris
   * ferme l'écran à qui navigue autrement.
   */
  readonly armed = signal<string | null>(null);

  /** Tout le vocabulaire, trié — l'usage et les brouillons confondus. */
  readonly all = computed(() =>
    [...new Set([...this.drafted(), ...this.inUse()])].sort((a, b) => a.localeCompare(b, 'fr')),
  );

  /**
   * Ce que la bande affiche : le vocabulaire filtré par la recherche.
   *
   * La recherche existe parce qu'un vocabulaire libre grossit — c'est ce qui
   * le rend utile et ce qui le rend illisible. Elle cherche **n'importe où**
   * dans le mot : « sant » doit trouver « croissant », sinon il faut savoir
   * comment le tag commence pour le retrouver, ce qui est exactement ce qu'on
   * ne sait pas.
   */
  readonly shown = computed(() => {
    const needle = normalize(this.search());
    if (needle === '') {
      return this.all();
    }
    return this.all().filter((tag) => tag.includes(needle));
  });

  /** Recense ce que les images portent. Appelé après chaque lecture, en CUMUL. */
  observe(tags: readonly (readonly string[])[]): void {
    this.inUse.update((current) => [...new Set([...current, ...tags.flat()])]);
  }

  /**
   * Ajoute un mot à la bande sans le poser sur quoi que ce soit.
   *
   * Normalisé **ici aussi** : le serveur le refera, mais un tag qui s'affiche
   * « Croissant » puis revient « croissant » donne l'impression d'un écran qui
   * corrige en douce. Mieux vaut qu'il montre tout de suite ce qu'il va écrire.
   *
   * @returns le mot normalisé, ou `null` si la saisie était vide.
   */
  draft(raw: string): string | null {
    const tag = normalize(raw);
    if (tag === '') {
      return null;
    }
    if (!this.all().includes(tag)) {
      this.drafted.update((current) => [...current, tag]);
    }
    this.armed.set(tag);
    return tag;
  }

  /** Arme un tag, ou le désarme si c'était déjà lui. */
  toggle(tag: string): void {
    this.armed.update((current) => (current === tag ? null : tag));
  }
}

/** La même normalisation que le domaine : découpé, en minuscules. */
function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}
