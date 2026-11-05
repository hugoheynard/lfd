/**
 * **Les lectures faites d'avance pendant une bascule d'espace** (lot c du plan
 * `documentation/caching-usage/dans-quel-espace-est-le-client.md`).
 *
 * Une lecture est rangée sous sa clé complète et rendue UNE fois, à qui la
 * redemande — le lecteur, à l'acceptation. Elle n'est jamais affichée d'ici :
 * tant que le contexte n'a pas accepté l'espace, personne ne la demande.
 * `forget` jette tout ce qui a été lu pour un espace abandonné.
 *
 * Pas un service : chaque store a sa propre forme de clé et de réponse.
 */
export class AheadReads<T> {
  private readonly held = new Map<
    string,
    { readonly workspace: string; readonly read: Promise<T> }
  >();

  /** Lance la lecture si elle ne l'est pas déjà. Un échec ne se voit qu'à qui la reprend. */
  ask(workspace: string, key: string, read: () => Promise<T>): void {
    if (this.held.has(key)) {
      return;
    }
    const pending = read();
    // Sans preneur, un rejet ne doit pas remonter comme une erreur non traitée.
    pending.catch(() => undefined);
    this.held.set(key, { workspace, read: pending });
  }

  /** La lecture faite d'avance pour cette clé, retirée, ou `null`. */
  take(key: string): Promise<T> | null {
    const held = this.held.get(key);
    if (held === undefined) {
      return null;
    }
    this.held.delete(key);
    return held.read;
  }

  /** Jette ce qui a été lu pour un espace qui ne sera pas montré. */
  forget(workspace: string): void {
    for (const [key, held] of this.held) {
      if (held.workspace === workspace) {
        this.held.delete(key);
      }
    }
  }
}
