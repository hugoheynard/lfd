import { resupplyNameOf } from "./resupply-name.js";
import {
  type ResupplyListLine,
  type ResupplyListRefusals,
  resupplyListOf,
} from "./resupply-line-list.js";
import {
  BlankResupplyTemplateSkuError,
  DuplicateResupplyTemplateLineError,
  EmptyResupplyTemplateError,
  ResupplyTemplateNameRequiredError,
  TooManyResupplyTemplateLinesError,
} from "./resupply-template-errors.js";
import type { ResupplyTarget } from "./site-resupply-snapshot.js";

/**
 * **Ce que l'écran compose** : un nom, une visée proposée, des lignes. Sans
 * point — il est figé à la création — ni journée : un modèle ne part jamais.
 */
export interface ResupplyTemplateContent {
  readonly name: string;
  readonly target: ResupplyTarget;
  readonly lines: readonly ResupplyListLine[];
}

const TEMPLATE_REFUSALS: ResupplyListRefusals = {
  empty: () => new EmptyResupplyTemplateError(),
  tooMany: (max) => new TooManyResupplyTemplateLinesError(max),
  blankSku: () => new BlankResupplyTemplateSkuError(),
  duplicate: (sku) => new DuplicateResupplyTemplateLineError(sku),
};

/**
 * Le contenu validé : le nom suit la règle des réassorts (`resupplyNameOf`)
 * mais il est OBLIGATOIRE — un modèle se choisit par son nom ; les lignes
 * suivent la règle d'une composition sous les refus du modèle.
 *
 * @throws {ResupplyTemplateNameRequiredError} nom vide une fois rogné.
 */
export function templateContentOf(input: ResupplyTemplateContent): ResupplyTemplateContent {
  const name = resupplyNameOf(input.name);
  if (name === null) {
    throw new ResupplyTemplateNameRequiredError();
  }
  return { name, target: input.target, lines: resupplyListOf(input.lines, TEMPLATE_REFUSALS) };
}
