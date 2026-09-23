import type {
  ProductSectionFamily,
  StaffNavPreferences,
  StaffNavPreferencesPatch,
} from "@lfd/contracts";

/**
 * Les préférences de navigation d'une personne du staff — un sac JSON purement
 * UI, persisté sur la fiche pour qu'il suive la PERSONNE et non la machine.
 *
 * Aucun invariant métier ici : ces valeurs ne protègent rien. Ce fichier ne
 * garantit que deux comportements, et ils sont du comportement, pas du type :
 * la **relecture défensive** d'une colonne `Json?` (donc `unknown`), et la
 * **fusion** d'une préférence dans le sac sans toucher aux autres.
 *
 * La forme, elle, vient des contrats : l'écrire deux fois, c'est entretenir un
 * miroir à la main, et un miroir entretenu à la main finit par renvoyer autre
 * chose.
 */

/**
 * Une valeur JSON, telle qu'une colonne `Json` peut en contenir.
 *
 * Écrite ici plutôt qu'empruntée à Prisma : le domaine ne connaît pas la
 * persistance, et un `Prisma.InputJsonValue` qui remonterait jusqu'ici casserait
 * la frontière que l'adaptateur existe pour tenir. La forme est structurelle,
 * donc les deux se rencontrent sans conversion.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Ce que porte le sac tel qu'il est rangé en base : des clés, des valeurs JSON. */
export type StaffNavPreferencesBag = Readonly<Record<string, JsonValue>>;

/**
 * Comment UNE préférence se relit depuis le JSON : de l'inconnu vers la valeur
 * admise, ou vers « aucun choix ». Jamais d'exception — voir
 * {@link parseStaffNavPreferences}.
 */
type PreferenceReader<K extends keyof StaffNavPreferences> = (
  raw: JsonValue | undefined,
) => StaffNavPreferences[K];

/**
 * 🔴 **Le registre des préférences connues — le seul endroit qui les énumère.**
 *
 * Décidé le 2026-09-23, à l'ajout de la DEUXIÈME préférence, et c'est la
 * première qui a montré le défaut : les deux fonctions de ce fichier listaient
 * chacune leurs clés à la main. La relecture en jetait une qu'on oubliait — au
 * moins visible à l'écran. La fusion, elle, l'ignorait en **silence** : un
 * `PATCH` accepté, un 204 rendu, et rien en base.
 *
 * Le partage est donc celui-ci, et il tient pour la troisième préférence comme
 * pour la deuxième : ce qui DÉPEND de la clé — la forme qu'elle admet — vit
 * ici, une ligne par préférence ; ce qui n'en dépend pas — fusionner sans
 * écraser — est devenu générique et n'énumère plus rien
 * ({@link mergeStaffNavPreferences}). Le type mappé ferme l'oubli : une clé
 * ajoutée au contrat sans lecteur ne compile pas.
 *
 * Pourquoi pas `staffNavPreferencesSchema`, qui saurait tout faire d'un coup :
 * le domaine ne dépend ni de Zod ni d'aucun runtime. La liste des familles est
 * donc redite dans {@link readProductSectionFamily} — et le spec voisin la
 * confronte aux options du schéma, pour qu'une famille de plus rougisse ici
 * plutôt que de disparaître à la relecture.
 */
const STAFF_NAV_PREFERENCE_READERS: {
  readonly [K in keyof StaffNavPreferences]-?: PreferenceReader<K>;
} = {
  worksheetCategory: readOpenText,
  productSectionFamily: readProductSectionFamily,
};

/**
 * Aucune préférence encore posée — la valeur de TOUTES les fiches d'avant la
 * colonne.
 *
 * Déduit de la relecture d'une colonne nulle plutôt que réécrit : c'est
 * exactement ce que la phrase veut dire, et une constante recopiée à la main
 * serait le troisième endroit à mettre à jour.
 */
export const EMPTY_STAFF_NAV_PREFERENCES: StaffNavPreferences = parseStaffNavPreferences(null);

/**
 * Reconstruit des préférences **sûres** depuis la colonne JSON.
 *
 * Aucune exception, jamais : une donnée d'affichage corrompue — ou simplement
 * absente, ce qui est le cas normal d'une colonne neuve — ne doit pas casser
 * `/admin/me`, c'est-à-dire l'amorçage de tout le back-office. Ce qui n'est pas
 * reconnu retombe sur « aucun choix ».
 *
 * Les bornes du contrat ne sont pas toutes rejouées ici : elles gardent
 * l'ÉCRITURE, et une valeur trop longue déjà rangée reste parfaitement
 * affichable. Refuser à la relecture ne réparerait rien et casserait l'écran.
 *
 * ⚠️ Le sac se construit clé par clé, au lieu de boucler sur le registre : une
 * boucle rendrait un `Record<string, …>` qu'il faudrait forcer vers
 * `StaffNavPreferences`, et le dépôt ne veut pas de cast. Le littéral coûte une
 * ligne par préférence, et fait échouer la compilation (TS2741) si on l'oublie
 * — un oubli visible à la compilation vaut mieux qu'une boucle muette.
 */
export function parseStaffNavPreferences(value: unknown): StaffNavPreferences {
  const bag = asBag(value);
  const readers = STAFF_NAV_PREFERENCE_READERS;
  return {
    worksheetCategory: readers.worksheetCategory(bag["worksheetCategory"]),
    productSectionFamily: readers.productSectionFamily(bag["productSectionFamily"]),
  };
}

/**
 * Applique une charge partielle **par fusion**, et c'est tout l'intérêt.
 *
 * Remplacer le sac entier marcherait tant qu'il n'y a qu'une préférence, puis
 * ferait s'effacer la seconde par la première sans que rien ne le signale. Les
 * clés qu'on ne connaît pas sont donc recopiées telles quelles — y compris
 * celles d'une version plus récente du front.
 *
 * Générique depuis le 2026-09-23 : elle ne nomme plus aucune préférence, donc
 * la suivante n'a rien à y ajouter. Ce qu'elle doit continuer de tenir est la
 * distinction que porte le `.partial()` du contrat — une clé **absente** vaut
 * « n'y touche pas », là où `null` est une VALEUR qui efface le choix. D'où le
 * parcours des seules clés présentes dans la charge : une boucle sur les clés
 * connues, elle, écrirait `null` partout.
 */
export function mergeStaffNavPreferences(
  stored: unknown,
  patch: StaffNavPreferencesPatch,
): StaffNavPreferencesBag {
  const merged: Record<string, JsonValue> = { ...asBag(stored) };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in STAFF_NAV_PREFERENCE_READERS)) {
      // Une clé que ce serveur ne sait pas relire ne s'écrit pas : elle
      // dormirait dans le sac sans que personne ne la rende. Zod l'a déjà
      // retirée à la porte HTTP ; cette garde couvre un appelant interne.
      continue;
    }
    merged[key] = value ?? null;
  }
  return merged;
}

/**
 * Un texte libre, rangé, vide valant « aucun choix ».
 *
 * Aucune liste admise : les catégories de fiche d'atelier vivent dans le
 * référentiel et bougent sans prévenir ici. Les relire contre une liste ferait
 * disparaître le choix d'une personne le jour où une catégorie est renommée.
 */
function readOpenText(raw: JsonValue | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Une famille de sections de la fiche produit, ou « aucun choix ».
 *
 * Contrairement au texte libre ci-dessus, la liste est **fermée** et rejouée à
 * la relecture — pas par zèle, mais parce que le type l'exige : rendre une
 * chaîne hors liste serait mentir sur `ProductSectionFamily`. C'est aussi le
 * seul comportement utile, l'écran n'ayant pas d'onglet pour une famille qu'il
 * ne connaît pas : retomber sur « tout voir » montre la fiche entière plutôt
 * qu'un filtre qui ne filtre rien.
 */
function readProductSectionFamily(raw: JsonValue | undefined): ProductSectionFamily | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  switch (trimmed) {
    case "identite":
    case "commerce":
    case "reglementaire":
    case "communication":
      return trimmed;
    default:
      return null;
  }
}

/** Une valeur JSON quelconque vue comme un sac de clés. Tout le reste vaut « vide ». */
function asBag(value: unknown): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  // La colonne est du JSON : ce qui est un objet est un objet de valeurs JSON.
  // La relecture défensive ci-dessus ne présume rien de plus — chaque clé lue
  // est re-vérifiée avant d'être rendue.
  return value as Record<string, JsonValue>;
}
