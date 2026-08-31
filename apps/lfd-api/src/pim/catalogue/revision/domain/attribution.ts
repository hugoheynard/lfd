import { PIM_EVENTS } from "../../../journal/pim-journal.js";
import type { PimJournalFact } from "../../../journal/pim-journal-reader.js";

/**
 * **Qui a changé ce champ, et quand.**
 *
 * Une révision sait QUI l'a posée ; elle ne sait pas qui a écrit chacune de ses
 * lignes. Cette réponse-là vit dans le journal, un fait à la fois. Ce module
 * fait le pont entre les deux vocabulaires — et ce pont est la pièce fragile du
 * dispositif, parce qu'il est une TROISIÈME déclaration du même ensemble de
 * champs, après le payload d'une révision et celui d'un fait.
 *
 * Il est donc tenu par un test qui parcourt `PIM_EVENTS` : un fait de produit
 * ajouté sans entrée ici ne compile pas la suite. Sans ça, un événement neuf
 * n'attribuerait plus rien, en silence — et le silence, ici, ressemble
 * exactement à « personne n'a touché à ce champ ».
 */

/** L'attribution d'une ligne. `by` à `null` = le système, pas une personne. */
export interface FieldAuthor {
  readonly by: string | null;
  readonly at: Date;
}

/**
 * Ce qu'un fait touche, dans le vocabulaire d'une RÉVISION.
 *
 * `null` = ce fait ne parle d'aucun champ d'article. `"*"` = il les touche tous
 * (la fiche vient d'apparaître). Sinon, la liste des champs — et pour les faits
 * de section, elle se lit dans le payload lui-même plutôt que d'être écrite
 * ici : `product.identity_saved` dit déjà quels champs il a changés.
 */
const TOUCHES: Readonly<Record<string, readonly string[] | "changes" | "*">> = {
  // Ces quatre-là portent un diff `{ changes: { champ: { from, to } } }` dont
  // les clés SONT déjà des champs de révision. Les recopier ici ferait une
  // quatrième déclaration à tenir d'accord.
  [PIM_EVENTS.productIdentitySaved]: "changes",
  [PIM_EVENTS.productPricingSaved]: "changes",
  [PIM_EVENTS.productDeclarationSaved]: ["allergens"],
  [PIM_EVENTS.productEditorialSaved]: ["editorial"],
  [PIM_EVENTS.productMediaSaved]: ["media"],
  // Le payload d'un changement de taux est indexé par CONTEXTE (`{ eatIn: … }`),
  // pas par champ : ses clés ne sont donc pas lisibles comme des champs, et la
  // correspondance s'écrit.
  [PIM_EVENTS.productVatChanged]: ["vatByContext"],
  [PIM_EVENTS.productChannelsChanged]: ["soldContexts"],
  [PIM_EVENTS.productPublished]: ["status"],
  [PIM_EVENTS.productUnpublished]: ["status"],
  [PIM_EVENTS.productArchived]: ["status"],
  [PIM_EVENTS.productRestored]: ["status"],
  [PIM_EVENTS.productCreated]: "*",
  // Une signature ne modifie RIEN de la fiche : elle affirme quelque chose sur
  // elle. L'attribuer à un champ ferait dire à l'écran que quelqu'un a changé
  // un prix alors qu'il a seulement déclaré la fiche juste.
  [PIM_EVENTS.productDeclaredReady]: [],
  // La PROVENANCE ne figure dans aucune ancre — pour l'instant, et c'est une
  // constatation, pas un oubli. Une révision fige ce qui est PUBLIÉ, et rien ne
  // pousse encore les ingrédients vers un canal. Le jour où le B2B les affichera
  // (c'est la raison qui a fait versionner le catalogue entier), ils entreront
  // dans `RevisionItemInput` et cette ligne citera leur champ.
  [PIM_EVENTS.productIngredientsSaved]: [],
};

/** Les champs de révision qu'un fait touche. Vide = il n'en touche aucun. */
export function fieldsTouchedBy(fact: PimJournalFact): readonly string[] | "*" {
  const rule = TOUCHES[fact.type];
  if (rule === undefined) {
    return [];
  }
  if (rule !== "changes") {
    return rule;
  }
  const changes = readChanges(fact.payload);
  return changes === null ? [] : Object.keys(changes);
}

/**
 * Le dernier auteur de chaque champ, parmi les faits donnés.
 *
 * Les faits arrivent du plus RÉCENT au plus ancien : le premier qui touche un
 * champ est donc celui qui l'a fait, et les suivants ne le réécrivent pas.
 * L'ordre est une précondition — le port qui les rend le garantit, et l'inverser
 * attribuerait la première modification au lieu de la dernière sans que rien ne
 * le signale.
 *
 * Un champ absent de la carte n'a **pas d'auteur connu**, et c'est un résultat :
 * il vient d'un seed, d'un script, ou d'un verbe qui ne trace pas encore. Lui
 * coller l'auteur de la révision serait accuser quelqu'un qui a seulement
 * appuyé sur « poser ».
 */
export function attributeFields(
  fields: readonly string[],
  facts: readonly PimJournalFact[],
): ReadonlyMap<string, FieldAuthor> {
  const authors = new Map<string, FieldAuthor>();
  for (const fact of facts) {
    const touched = fieldsTouchedBy(fact);
    for (const field of fields) {
      if (authors.has(field)) {
        continue;
      }
      if (touched === "*" || touched.includes(field)) {
        authors.set(field, { by: fact.actorName, at: fact.occurredAt });
      }
    }
  }
  return authors;
}

/** Le bloc `changes` d'un payload, ou `null` s'il n'en porte pas. */
function readChanges(payload: unknown): Record<string, unknown> | null {
  return readObject(payload, "changes");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Les faits de PRODUIT — ceux que ce module doit savoir interpréter. */
export const PRODUCT_FACT_TYPES: readonly string[] = Object.values(PIM_EVENTS).filter((type) =>
  type.startsWith("product."),
);

/** Ce que la table couvre — lu par le test qui la tient à jour. */
export const ATTRIBUTED_FACT_TYPES: readonly string[] = Object.keys(TOUCHES);

/**
 * ── Les causes GLOBALES ──────────────────────────────────────────────────────
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
}

/** Les causes d'un intervalle, dites en français. */
export function causesOf(facts: readonly PimJournalFact[]): readonly GlobalCause[] {
  return facts.flatMap((fact) => {
    const explains = GLOBAL_CAUSES[fact.type];
    if (explains === undefined) {
      return [];
    }
    return [
      {
        type: fact.type,
        label: labelOf(fact),
        by: fact.actorName,
        at: fact.occurredAt,
        explains,
        blast: blastOf(fact.payload),
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
 * qu'il porte : `vat_rate.rate_changed` a un nom et deux valeurs, les autres
 * n'ont souvent qu'un identifiant. Inventer une jointure pour embellir la
 * phrase ferait dépendre un historique d'une table qui, elle, continue de
 * changer — et un taux supprimé n'aurait plus de nom du tout.
 */
function labelOf(fact: PimJournalFact): string {
  const payload = fact.payload;
  const name = readScalar(payload, "name");
  const from = readScalar(payload, "from");
  const to = readScalar(payload, "to");
  const subject = name ?? fact.subjectId;
  if (from !== null && to !== null) {
    return `${subject} : ${from} → ${to}`;
  }
  return subject;
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

function readObject(payload: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const value: unknown = payload[key];
  return isRecord(value) ? { ...value } : null;
}

function readScalar(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const value: unknown = payload[key];
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" ? String(value) : null;
}
