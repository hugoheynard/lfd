import { optional, recordOf, type Payload } from './payload-read';
import { labelIn } from './values';
import { SALES_CONTEXT } from './values/referential-values';

/**
 * **Le mot d'un contexte de vente, par sa clé** — celle que `vatByContext` et
 * la portée (`blast.families`) emploient comme clés de record.
 *
 * Dans cet ordre : le libellé figé à l'écriture dans la charge (`contextLabels`,
 * lot D du plan des phrases, 2026-09-19) — le nom du contexte QUAND c'est
 * arrivé ; sinon le dictionnaire (`SALES_CONTEXT`), qui ne connaît que les
 * contextes semés ; sinon `null`, et l'appelant dit la clé telle quelle — un
 * contexte créé à l'écran avant `contextLabels` n'a pas d'autre nom.
 *
 * Un seul lecteur pour la phrase, le détail et la méta de portée : trois
 * endroits qui nommeraient un même contexte de deux façons raconteraient deux
 * histoires.
 */
export function contextWord(payload: Payload, key: string): string | null {
  return optional(recordOf(payload['contextLabels'])?.[key]) ?? labelIn(SALES_CONTEXT, key);
}
