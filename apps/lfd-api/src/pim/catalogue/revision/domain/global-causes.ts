import { PIM_EVENTS } from "../../../journal/pim-journal.js";
import type { PimJournalFact } from "../../../journal/pim-journal-reader.js";
import { isRecord, readObject, readScalar } from "./payload-reading.js";

/**
 * **Les causes GLOBALES d'un diff de révisions** — sorties d'`attribution.ts`
 * le 2026-09-19, quand leurs libellés de contextes l'ont fait passer au-delà
 * de trois cents lignes : l'attribution nomme un auteur, la cause une piste.
 *
 * Changer un taux de TVA est **un** fait, sur **un** sujet, qui altère le prix
 * de cent articles. Aucun de ces cent produits n'a de fait à lui : l'attribution
 * par sujet ne trouve donc rien, et l'écran répète cent fois « auteur non défini par une action locale »
 * pour une décision que quelqu'un a prise une fois, en connaissance de cause.
 *
 * Ces faits-là ne sont pas attribués à une ligne — ce serait affirmer qu'ils
 * l'ont causée, alors qu'ils ont seulement PU la causer. Ils sont rendus à part,
 * avec ce qu'ils disent d'eux-mêmes, et l'écran les pose au-dessus du diff : au
 * lecteur de faire le lien, avec les éléments pour le faire.
 */

/** Ce qu'un fait global peut altérer, dans le vocabulaire d'une révision. */
const GLOBAL_CAUSES: Readonly<Record<string, readonly string[]>> = {
  [PIM_EVENTS.vatRateRateChanged]: ["vatByContext"],
  [PIM_EVENTS.vatRateDeleted]: ["vatByContext"],
  [PIM_EVENTS.productCategoryVatChanged]: ["vatByContext"],
  [PIM_EVENTS.productCategoryChannelsChanged]: ["soldContexts"],
  [PIM_EVENTS.productCategoryRenamed]: ["categoryName"],
  [PIM_EVENTS.productCategoryMoved]: ["categoryId", "categoryName"],
  // Un contexte de vente qu'on ouvre, ferme ou renomme change les CLÉS des
  // deux cartes : un article peut gagner ou perdre une ligne sans que personne
  // n'ait touché à sa fiche.
  [PIM_EVENTS.salesContextCreated]: ["vatByContext", "soldContexts"],
  [PIM_EVENTS.salesContextUpdated]: ["vatByContext", "soldContexts"],
  [PIM_EVENTS.salesContextDeleted]: ["vatByContext", "soldContexts"],
};

/** Les types de faits à relire pour trouver des causes. */
export const GLOBAL_CAUSE_TYPES: readonly string[] = Object.keys(GLOBAL_CAUSES);

/** Une cause possible, telle qu'un écran la pose au-dessus d'un diff. */
export interface GlobalCause {
  readonly type: string;
  /** Ce que le fait dit de lui-même, en une phrase. */
  readonly label: string;
  readonly by: string | null;
  readonly at: Date;
  /** Les champs d'article que ce fait peut avoir altérés. */
  readonly explains: readonly string[];
  /**
   * **Sa portée**, telle que le fait l'a enregistrée au moment de l'acte.
   *
   * Un taux révisé porte déjà « 1 famille en b2b, 1 en eatIn » : c'est ce qui
   * transforme une ligne d'historique en explication. Sans elle, l'écran dirait
   * qu'un taux a bougé sans dire ce que ça a touché — et c'est justement la
   * question qu'on se pose devant cinquante articles modifiés.
   *
   * Relue du payload et JAMAIS recalculée : recompter aujourd'hui donnerait la
   * portée d'aujourd'hui, pas celle du jour de la décision.
   */
  readonly blast: Readonly<Record<string, number>>;
  /**
   * **Le nom du moment de chaque contexte que `blast` compte par sa clé** —
   * `{ brunch: "Brunch" }`.
   *
   * Relu de la charge (`contextLabels`, lot D du plan des phrases du journal)
   * et jamais résolu aujourd'hui (D5, décision de Hugo du 2026-09-19) : une
   * ligne d'avant, qui n'en porte pas, rend une carte vide, et l'écran dit
   * alors la clé.
   */
  readonly contextLabels: Readonly<Record<string, string>>;
}

/** Les causes d'un intervalle, dites en français. */
export function causesOf(facts: readonly PimJournalFact[]): readonly GlobalCause[] {
  return facts.flatMap((fact) => {
    const explains = GLOBAL_CAUSES[fact.type];
    if (explains === undefined) {
      return [];
    }
    const blast = blastOf(fact.payload);
    return [
      {
        type: fact.type,
        label: labelOf(fact),
        by: fact.actorName,
        at: fact.occurredAt,
        explains,
        blast,
        contextLabels: labelsOfBlast(fact.payload, blast),
      },
    ];
  });
}

/** Un champ est-il couvert par au moins une cause ? */
export function coveredBy(field: string, causes: readonly GlobalCause[]): GlobalCause | null {
  return causes.find((cause) => cause.explains.includes(field)) ?? null;
}

/**
 * La phrase d'un fait global.
 *
 * Elle se construit sur ce que le payload PORTE, pas sur ce qu'on aimerait
 * qu'il porte. Depuis le lot B du plan des phrases (2026-09-19), un fait porte
 * le nom de son sujet (`subjectLabel`) et cite les objets avec leur nom du
 * moment (`{ id, name }`) : la phrase les lit en premier. Une ligne d'avant
 * n'a souvent qu'un `name`, voire que des identifiants : elle se dit avec ce
 * qu'elle a. Inventer une jointure pour l'embellir ferait dépendre un
 * historique d'une table qui, elle, continue de changer — et un taux supprimé
 * n'aurait plus de nom du tout.
 */
function labelOf(fact: PimJournalFact): string {
  const payload = fact.payload;
  const subject =
    readScalar(payload, "subjectLabel") ?? readScalar(payload, "name") ?? fact.subjectId;
  // `parent` depuis le lot B, `parentId` avant (un déplacement de famille) ;
  // à plat pour un taux.
  const move =
    readObject(payload, "parent") ??
    readObject(payload, "parentId") ??
    (isRecord(payload) ? payload : null);
  const from = move === null ? null : citedOf(move["from"]);
  const to = move === null ? null : citedOf(move["to"]);
  if (from !== null && to !== null) {
    return `${subject} : ${from} → ${to}`;
  }
  return subject;
}

/**
 * Une valeur d'un « avant → après », dite : un scalaire tel quel, un objet cité
 * par son nom, `null` pour « aucune » — une famille déplacée à la racine n'a
 * plus de parent, et c'est une valeur. `null` en retour : rien de lisible.
 */
function citedOf(value: unknown): string | null {
  if (value === null) {
    return "aucune";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return readScalar(value, "name");
}

/**
 * La portée enregistrée dans le payload — `{ blast: { families: { … } } }`.
 *
 * Aplatie sur un seul niveau : l'écran affiche « b2b : 1 · eatIn : 1 », il n'a
 * pas à connaître la forme imbriquée que chaque type de fait a choisie. Absente
 * ou illisible ⇒ carte vide, ce qui se lit « portée non enregistrée » plutôt
 * qu'un zéro qui dirait « ça n'a rien touché ».
 */
function blastOf(payload: unknown): Readonly<Record<string, number>> {
  const blast = readObject(payload, "blast");
  if (blast === null) {
    return {};
  }
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(blast)) {
    if (typeof value === "number") {
      counts[key] = value;
      continue;
    }
    // Un niveau de plus (`families: { b2b: 1 }`) : on garde les feuilles.
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [inner, count] of Object.entries(value)) {
        if (typeof count === "number") {
          counts[inner] = count;
        }
      }
    }
  }
  return counts;
}

/**
 * Les libellés que la charge porte pour les clés de sa portée — et pour elles
 * seules : une clé de `blast` qui n'est pas un contexte (`articles`) n'a pas de
 * libellé, et un libellé sans compte n'a rien à nommer à l'écran. Un libellé
 * vide ou non textuel est ignoré plutôt que rendu : la clé vaut mieux qu'un
 * nom blanc.
 */
function labelsOfBlast(
  payload: unknown,
  blast: Readonly<Record<string, number>>,
): Readonly<Record<string, string>> {
  const labels = readObject(payload, "contextLabels");
  if (labels === null) {
    return {};
  }
  const named: Record<string, string> = {};
  for (const key of Object.keys(blast)) {
    const label: unknown = labels[key];
    if (typeof label === "string" && label.length > 0) {
      named[key] = label;
    }
  }
  return named;
}
