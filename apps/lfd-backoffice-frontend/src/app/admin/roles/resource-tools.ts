import {
  isRetiredStaffResource,
  staffResourceSchema,
  STAFF_RESOURCE_LABELS,
  STAFF_RESOURCE_SCOPES,
  type StaffResource,
  type StaffResourceScope,
} from '@lfd/contracts';

/**
 * **À quel outil appartient un domaine de droits.**
 *
 * 🔴 **Il n'y a plus de table.** L'outil se lit dans la clé : `pim_catalog`
 * appartient au PIM, `b2b_pricing` à la plateforme, `staff_access` au socle,
 * `lfc_price_limits` à la vente LFC entière — pros et particuliers (2026-09-25),
 * `delivery_settings` à la livraison (2026-09-29), `production_packing` au
 * fournil et `handover_counter` au retrait (2026-10-01). La
 * version précédente de ce fichier portait un `Record<StaffResource, StaffTool>`
 * écrit à la main — une seconde déclaration de la même vérité, qu'il fallait
 * tenir d'accord avec le contrat.
 *
 * Elle a servi : c'est en la remplissant qu'on a vu que « catalogue » désignait
 * deux choses, que la tarification dormait dans les réglages, et que la cloche
 * du back-office était rangée sous le support client. Puis le contrat a été
 * découpé, et la table est devenue dérivable. C'est le bon sens de l'histoire —
 * un échafaudage se retire quand le mur tient.
 *
 * ⚠️ Restent des exceptions, et elles sont nommées : `activity` n'a pas de
 * préfixe, parce que le journal ne se range dans aucun outil ; `shop_bundles`
 * et `allergen_matrix` se rangent à la main (`RESOURCE_TOOL_EXCEPTIONS`).
 */
export type StaffTool =
  'pim' | 'lfc' | 'b2b' | 'production' | 'handover' | 'delivery' | 'staff' | 'ops' | 'transverse';

/** L'ordre des groupes à l'écran — du métier vers la plomberie. */
const TOOL_ORDER: readonly StaffTool[] = [
  'pim',
  'lfc',
  'b2b',
  'production',
  'handover',
  'delivery',
  'staff',
  'ops',
  'transverse',
];

const TOOL_LABELS: Readonly<Record<StaffTool, string>> = {
  pim: 'Référentiel produit',
  lfc: 'Vente LFC',
  b2b: 'Plateforme B2B',
  production: 'Fournil',
  handover: 'Retrait',
  delivery: 'Livraison',
  staff: 'Équipe et accès',
  ops: 'Exploitation',
  transverse: 'Transverse',
};

/** Ce que le groupe recouvre, pour qui ne connaît pas le découpage. */
const TOOL_HINTS: Readonly<Record<StaffTool, string>> = {
  pim: 'ce que le catalogue contient, et ce qui en sort',
  lfc: 'ce qui vaut pour la vente aux pros comme aux particuliers',
  b2b: 'les clients, les commandes, la vente',
  production: 'le plan du soir, la fiche d’atelier, le colisage',
  handover: 'la file de retrait et le scan du QR au comptoir',
  delivery: 'la feuille de route, la flotte, le départ des tournées',
  staff: 'qui est qui, et qui peut quoi',
  ops: 'la santé de l’écosystème',
  transverse: 'ce qui ne se range dans aucun outil',
};

/** Un domaine, prêt à peindre. */
export interface ToolResource {
  readonly resource: StaffResource;
  readonly label: string;
  /** Ce que la lecture ouvre et ce que l'écriture ajoute — affiché sous le libellé. */
  readonly scope: StaffResourceScope;
  /**
   * Retiré (`RETIRED_STAFF_RESOURCES`) : il n'ouvre plus rien, ne s'accorde
   * plus, et ne se montre que là où il est encore porté — pour être retiré.
   */
  readonly retired: boolean;
}

/** Un groupe d'outil et ses domaines, dans l'ordre du catalogue. */
export interface ToolGroup {
  readonly tool: StaffTool;
  readonly label: string;
  readonly hint: string;
  readonly resources: readonly ToolResource[];
}

/**
 * **Les ressources dont le préfixe ne nomme pas l'outil** — rangées à la main,
 * chacune avec sa raison.
 *
 * - `shop_bundles` : `shop` nomme la boutique, pas un écran. Les formules vont
 *   où leur écran vit, en Gestion Boutique avec la fidélité et les suggestions
 *   (`lfc`, Hugo, 2026-10-19) ; avant, elles tombaient en « Transverse ».
 * - `allergen_matrix` : la matrice est une lecture du RÉFÉRENTIEL (routes
 *   `/pim/allergen-matrix*`), rangée avec `pim_catalog` (Hugo, 2026-10-20). Sa
 *   clé n'a pas de préfixe `pim_` — le contrat l'a nommée ainsi, et une valeur
 *   d'enum ne se renomme pas pour ranger un écran.
 */
const RESOURCE_TOOL_EXCEPTIONS: Readonly<Partial<Record<StaffResource, StaffTool>>> = {
  shop_bundles: 'lfc',
  allergen_matrix: 'pim',
};

/**
 * L'outil d'un domaine — **lu dans sa clé**.
 *
 * Une clé sans préfixe connu tombe dans `transverse` plutôt que d'échouer :
 * `activity` est là, et une ressource future sans outil s'y rangerait au lieu
 * de faire disparaître l'écran. Elle serait visible, donc corrigeable — ce
 * qu'une exception silencieuse n'est jamais.
 */
export function toolOf(resource: StaffResource): StaffTool {
  const exception = RESOURCE_TOOL_EXCEPTIONS[resource];
  if (exception !== undefined) {
    return exception;
  }
  const prefix = resource.split('_')[0];
  switch (prefix) {
    case 'pim':
    case 'lfc':
    case 'b2b':
    case 'production':
    case 'handover':
    case 'delivery':
    case 'staff':
    case 'ops':
      return prefix;
    default:
      return 'transverse';
  }
}

/**
 * Les domaines rangés par outil.
 *
 * L'ordre **dans** un groupe reste celui du catalogue de ressources : c'est lui
 * qui fait foi, et deux écrans qui trieraient différemment donneraient deux
 * lectures du même rôle.
 *
 * Une ressource retirée n'y figure que si `held` la porte : on ne la propose
 * jamais, on montre seulement celle qu'il reste à enlever
 * (`plan-droit-lfc-catalog.md`, L2, 2026-10-16).
 */
export function toolGroups(held: readonly StaffResource[] = []): readonly ToolGroup[] {
  return TOOL_ORDER.flatMap((tool) => {
    const resources = staffResourceSchema.options
      .filter((resource) => toolOf(resource) === tool)
      .filter((resource) => !isRetiredStaffResource(resource) || held.includes(resource))
      .map((resource) => ({
        resource,
        label: STAFF_RESOURCE_LABELS[resource],
        scope: STAFF_RESOURCE_SCOPES[resource],
        retired: isRetiredStaffResource(resource),
      }));
    return resources.length === 0
      ? []
      : [{ tool, label: TOOL_LABELS[tool], hint: TOOL_HINTS[tool], resources }];
  });
}
