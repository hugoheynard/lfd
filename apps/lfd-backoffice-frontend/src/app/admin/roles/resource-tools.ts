import { staffResourceSchema, STAFF_RESOURCE_LABELS, type StaffResource } from '@lfd/contracts';

/**
 * **À quel outil appartient un domaine de droits.**
 *
 * 🔴 **Il n'y a plus de table.** L'outil se lit dans la clé : `pim_catalog`
 * appartient au PIM, `b2b_pricing` à la plateforme, `staff_access` au socle. La
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
 * ⚠️ Reste **une** exception, et elle est nommée : `activity` n'a pas de
 * préfixe, parce que le journal ne se range dans aucun outil.
 */
export type StaffTool = 'pim' | 'b2b' | 'staff' | 'ops' | 'transverse';

/** L'ordre des groupes à l'écran — du métier vers la plomberie. */
const TOOL_ORDER: readonly StaffTool[] = ['pim', 'b2b', 'staff', 'ops', 'transverse'];

const TOOL_LABELS: Readonly<Record<StaffTool, string>> = {
  pim: 'Référentiel produit',
  b2b: 'Plateforme B2B',
  staff: 'Équipe et accès',
  ops: 'Exploitation',
  transverse: 'Transverse',
};

/** Ce que le groupe recouvre, pour qui ne connaît pas le découpage. */
const TOOL_HINTS: Readonly<Record<StaffTool, string>> = {
  pim: 'ce que le catalogue contient, et ce qui en sort',
  b2b: 'les clients, les commandes, la vente',
  staff: 'qui est qui, et qui peut quoi',
  ops: 'la santé de l’écosystème',
  transverse: 'ce qui ne se range dans aucun outil',
};

/** Un domaine, prêt à peindre. */
export interface ToolResource {
  readonly resource: StaffResource;
  readonly label: string;
}

/** Un groupe d'outil et ses domaines, dans l'ordre du catalogue. */
export interface ToolGroup {
  readonly tool: StaffTool;
  readonly label: string;
  readonly hint: string;
  readonly resources: readonly ToolResource[];
}

/**
 * L'outil d'un domaine — **lu dans sa clé**.
 *
 * Une clé sans préfixe connu tombe dans `transverse` plutôt que d'échouer :
 * `activity` est là, et une ressource future sans outil s'y rangerait au lieu
 * de faire disparaître l'écran. Elle serait visible, donc corrigeable — ce
 * qu'une exception silencieuse n'est jamais.
 */
export function toolOf(resource: StaffResource): StaffTool {
  const prefix = resource.split('_')[0];
  switch (prefix) {
    case 'pim':
    case 'b2b':
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
 */
export function toolGroups(): readonly ToolGroup[] {
  return TOOL_ORDER.flatMap((tool) => {
    const resources = staffResourceSchema.options
      .filter((resource) => toolOf(resource) === tool)
      .map((resource) => ({ resource, label: STAFF_RESOURCE_LABELS[resource] }));
    return resources.length === 0
      ? []
      : [{ tool, label: TOOL_LABELS[tool], hint: TOOL_HINTS[tool], resources }];
  });
}
