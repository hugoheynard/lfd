import type { PackingResource, PackingSheet, ProductionPackingView } from '@lfd/contracts';

/**
 * Les conversions pures du poste de colisage : la superposition des coches
 * locales sur ce que le serveur a rendu, et le **recalcul de la balance** qui en
 * découle.
 *
 * Hors du composant parce qu'aucune ne dépend de l'écran : ce sont des fonctions
 * pures, elles s'éprouvent sans monter quoi que ce soit, et la page reste sous
 * les 300 lignes que le dépôt s'impose.
 */

/** L'état de coche posé par la personne, avant que le serveur le confirme. */
export interface LocalPackingMark {
  readonly packed: boolean;
  readonly initials: string;
}

/** La clé d'une coche locale : une ligne d'un bac d'une journée. */
export function packingMarkKey(date: string, reference: string, sku: string): string {
  return `${date} ${reference} ${sku}`;
}

/** Les deux plateaux de la balance, une fois les coches locales prises en compte. */
export interface PackingBoard {
  readonly sheets: readonly PackingSheet[];
  readonly resources: readonly PackingResource[];
}

/**
 * Recouvre les bacs par ce qui a été coché **ici**, puis refait la ressource.
 *
 * 🔴 **Les deux ensemble, jamais l'un sans l'autre.** Recouvrir les lignes sans
 * recalculer `allocated` laisserait l'écran montrer douze croissants dans les
 * bacs et un reste qui les ignore — c'est-à-dire mentir exactement sur ce que
 * cet écran existe pour montrer. La balance ne se rééquilibre qu'à la relecture
 * suivante, et au sous-sol elle peut ne jamais venir.
 *
 * Les coches locales l'emportent, pour la raison qui a fait naître la file :
 * elles ont pu être posées alors que le réseau était absent, et la relecture
 * suivante remonterait sinon des cases vides sous les doigts de qui vient de les
 * cocher.
 *
 * `packedAt` d'une ligne reste celui du serveur : l'écran ne sait pas quelle
 * heure le serveur inscrira, et l'inventer ferait une heure fausse le temps d'un
 * rechargement.
 *
 * ⚠️ Un bac **fermé** n'est pas recouvert. Rien ne le rouvre, et une coche
 * locale restée en file après sa fermeture ne doit pas donner à l'écran l'air de
 * pouvoir encore le défaire.
 */
/**
 * Les coches locales **moins celles que le serveur a refusées pour de bon** —
 * jumeau de `withoutRefused` côté fiche d'atelier, à la clé du bac.
 *
 * 🔴 Sans ce filtre, une coche écartée de la file resterait affichée, et la
 * balance compterait comme réparti ce que le serveur n'a jamais accepté.
 */
export function withoutRefusedPacking(
  marks: ReadonlyMap<string, LocalPackingMark>,
  refused: readonly {
    readonly mark: { readonly date: string; readonly reference: string; readonly sku: string };
  }[],
): ReadonlyMap<string, LocalPackingMark> {
  if (refused.length === 0) {
    return marks;
  }
  const next = new Map(marks);
  for (const { mark } of refused) {
    next.delete(packingMarkKey(mark.date, mark.reference, mark.sku));
  }
  return next;
}

export function packingBoard(
  view: ProductionPackingView,
  marks: ReadonlyMap<string, LocalPackingMark>,
): PackingBoard {
  const sheets = view.sheets.map((sheet) => withLocalMarks(sheet, view.date, marks));
  return { sheets, resources: view.resources.map((resource) => rebalance(resource, sheets)) };
}

function withLocalMarks(
  sheet: PackingSheet,
  date: string,
  marks: ReadonlyMap<string, LocalPackingMark>,
): PackingSheet {
  if (sheet.packedAt !== null) {
    return sheet;
  }
  return {
    ...sheet,
    lines: sheet.lines.map((line) => {
      const mark = marks.get(packingMarkKey(date, sheet.reference, line.sku));
      // 🔴 Une ligne dont l'article n'est pas sorti du four ne se coche pas,
      // même par une coche restée en file : le serveur la refusera, et la
      // montrer cochée en attendant ferait compter comme réparti ce qui n'a
      // jamais été fabriqué — le reste affiché deviendrait faux dans le seul
      // sens qui coûte, optimiste.
      //
      // ⚠️ `awaitingProduction` n'est PAS recalculé ici, ni sur la ligne ni sur
      // la marchandise : c'est le serveur qui sait ce que le four a sorti. Il
      // traverse par le `...spread`, et c'est tout ce qu'on lui doit.
      if (mark === undefined || line.awaitingProduction) {
        return line;
      }
      return { ...line, packed: mark.packed, initials: mark.packed ? mark.initials : null };
    }),
  };
}

/**
 * `allocated` recompté sur les bacs affichés, `remaining` qui en découle.
 *
 * 🔴 `remaining` n'est **pas** borné à zéro : un nombre négatif dit que les bacs
 * demandent plus que le tirage n'a prévu, et c'est précisément le cas que ce
 * poste existe pour attraper. Le masquer l'effacerait.
 *
 * `produced` reste celui du serveur : il vient du compte à produire arrêté, que
 * rien ici ne peut changer.
 */
function rebalance(resource: PackingResource, sheets: readonly PackingSheet[]): PackingResource {
  let allocated = 0;
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      if (line.packed && line.sku === resource.sku) {
        allocated += line.quantity;
      }
    }
  }
  return { ...resource, allocated, remaining: resource.produced - allocated };
}

/** Combien de lignes d'un bac sont dedans. */
export function packedCount(sheet: PackingSheet): number {
  return sheet.lines.filter((line) => line.packed).length;
}

/** Le bac est-il complet — toutes ses lignes cochées, et au moins une ligne ? */
export function isComplete(sheet: PackingSheet): boolean {
  return sheet.lines.length > 0 && packedCount(sheet) === sheet.lines.length;
}

/** « Retrait » / « Livraison » — sur quelle pile le bac va. */
export function methodLabel(method: PackingSheet['fulfillmentMethod']): string {
  return method === 'pickup' ? 'Retrait' : 'Livraison';
}

/**
 * Le terme de recherche, réduit à ce qui se compare : minuscules, sans accents.
 *
 * Le fournil tape « croissant » sur une étiquette qui dit « Croissant », et
 * « pate a choux » sur une fiche qui dit « Pâte à choux ». Comparer les chaînes
 * telles quelles aurait fait rater exactement les cas où l'on cherche vite.
 *
 * `NFD` sépare la lettre de son accent, et la plage `U+0300–U+036F` retire les
 * diacritiques combinants — ce que `toLowerCase()` seul ne fait pas.
 */
export function normaliseTerm(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim();
}

/**
 * Cet article répond-il au terme cherché ?
 *
 * Sur le NOM **et** sur le SKU : le fournil tape « croissant », un poste qui lit
 * une étiquette de bac tape la référence article. Deux entrées pour une même
 * question, parce que ce sont deux gestes réels et non deux goûts.
 */
export function matchesTerm(normalisedTerm: string, sku: string, productName: string): boolean {
  if (normalisedTerm === '') {
    return false;
  }
  return (
    normaliseTerm(productName).includes(normalisedTerm) ||
    normaliseTerm(sku).includes(normalisedTerm)
  );
}
