/**
 * **Retrouver la clé d'un texte affiché** — dans l'aperçu SEULEMENT (plan
 * `plan-textes-de-la-boutique.md`, §5 : « chaque texte rendu porte sa clé »).
 *
 * `ClientCopyService` ne sait pas quel texte est où, et le DOM non plus : une
 * phrase arrive à l'écran comme du texte, interpolée par un gabarit qu'on ne
 * touche pas. L'aperçu fait donc porter la clé PAR LE TEXTE lui-même : chaque
 * chaîne du dictionnaire est précédée d'un marqueur invisible qui encode un
 * numéro de clé, en caractères de largeur nulle et sans coupure de ligne
 * (U+2061 à U+2064, « invisibles » d'Unicode). Le texte se rend comme avant ;
 * un clic relit le marqueur le plus proche, un parcours du DOM les relève tous.
 *
 * ⚠️ La limite — elle est structurelle, pas un défaut de réglage :
 *
 * - seules les chaînes servies par `ClientCopyService.t` sont marquées. Les
 *   fonctions d'écran (`slotPickerCopy(locale)`…) et les textes en dur des
 *   gabarits ne passent pas par lui (ils y viendront en T4) : un clic dessus ne
 *   rend rien ;
 * - un texte que le CODE transforme avant de l'afficher (`split`, `slice`,
 *   comparaison, longueur) voit son marqueur avec lui : un `split('\n')` le
 *   laisse sur la première ligne seulement, une comparaison d'égalité à une
 *   chaîne du dictionnaire échoue. Rien de tel n'est connu sur le parcours de
 *   commande ; c'est l'aperçu qui en pâtirait, jamais la boutique ;
 * - un texte posé dans un attribut (`aria-label`, `title`) porte son marqueur,
 *   mais on ne peut pas cliquer dessus ; seuls les `placeholder` sont relevés.
 */

const START = '⁣';
const ZERO = '⁡';
const ONE = '⁢';
const END = '⁤';
const MARKER = /⁣([⁡⁢]+)⁤/gu;
const BINARY = 2;

/** Le registre des clés de CETTE session d'aperçu : une clé, un numéro. */
export class CopyMarkers {
  private readonly ids = new Map<string, number>();
  private readonly keys: string[] = [];

  /** Le marqueur invisible d'une clé, à placer devant son texte. */
  markerOf(key: string): string {
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.keys.length;
      this.keys.push(key);
      this.ids.set(key, id);
    }
    const bits = id.toString(BINARY).replaceAll('0', ZERO).replaceAll('1', ONE);
    return `${START}${bits}${END}`;
  }

  /** Chaque chaîne d'un dictionnaire, précédée du marqueur de sa clé — prêt pour `overlayCopy`. */
  markAll(dictionary: object): Readonly<Record<string, string>> {
    const texts: Record<string, string> = {};
    for (const [key, text] of stringLeaves(dictionary, '')) {
      texts[key] = this.markerOf(key) + text;
    }
    return texts;
  }

  /** Les marqueurs d'un texte, dans l'ordre, avec leur position. */
  read(
    text: string,
  ): readonly { readonly key: string; readonly index: number; readonly end: number }[] {
    return [...text.matchAll(MARKER)].flatMap((match) => {
      const key =
        this.keys[parseInt((match[1] ?? '').replaceAll(ZERO, '0').replaceAll(ONE, '1'), BINARY)];
      return key === undefined
        ? []
        : [{ key, index: match.index, end: match.index + match[0].length }];
    });
  }

  /** La clé du marqueur placé au plus près AVANT `offset` ; le premier du texte sinon. */
  keyAt(text: string, offset: number): string | null {
    const markers = this.read(text);
    const before = markers.filter((marker) => marker.index <= offset).at(-1);
    return (before ?? markers[0])?.key ?? null;
  }
}

/** Les chaînes d'un dictionnaire, avec leur chemin (`cart.whoTitle`, `nav.links.0`). */
function* stringLeaves(node: unknown, path: string): Generator<readonly [string, string]> {
  if (typeof node === 'string') {
    yield [path, node];
    return;
  }
  if (typeof node !== 'object' || node === null) {
    return;
  }
  for (const [name, child] of Object.entries(node)) {
    yield* stringLeaves(child, path === '' ? name : `${path}.${name}`);
  }
}
