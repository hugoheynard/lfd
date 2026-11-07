import type { MailDocument, MailTemplateDeclaration, ModelBlock } from "./mail-document.js";
import { modelSectionOfLayoutSection, type ModelSectionId } from "./model-sections.js";

/** L'identifiant d'un bloc du modèle dans un document : stable, tiré de sa section. */
export function modelBlockId(section: ModelSectionId): string {
  return `model:${section}`;
}

function modelBlock(section: ModelSectionId): ModelBlock {
  return { id: modelBlockId(section), kind: "model", section };
}

/**
 * L'ordre des blocs du modèle tiré d'un ordre de sections de la coquille :
 * inconnus et non déclarés écartés, le lien secondaire rangé dans le bloc de
 * son bouton (à la place du premier des deux), doublons écartés, puis les
 * blocs déclarés qu'il ne nomme pas, dans l'ordre de la déclaration — la
 * règle de `effectiveSectionOrder` (`@lfd/mailer`), qui ne perd rien.
 */
function orderedSections(
  declaration: MailTemplateDeclaration,
  layoutOrder: readonly string[],
): readonly ModelSectionId[] {
  const named: ModelSectionId[] = [];
  for (const layoutSection of layoutOrder) {
    const section = modelSectionOfLayoutSection(layoutSection);
    if (section !== null && declaration.modelBlocks.includes(section) && !named.includes(section)) {
      named.push(section);
    }
  }
  return [...named, ...declaration.modelBlocks.filter((section) => !named.includes(section))];
}

/**
 * **Le document de départ d'un e-mail** (plan `plan-editeur-par-blocs.md`,
 * §§ 3 et 5) : ses blocs du modèle, sans bloc libre, dans l'ordre
 * d'aujourd'hui — l'ordre publié de la coquille s'il y en a un
 * (`public.mail_section_orders`, lu par l'appelant : ce paquet ne lit rien),
 * sinon celui de la déclaration. Calculé à la lecture, jamais écrit.
 */
export function startingMailDocument(
  template: string,
  declaration: MailTemplateDeclaration,
  publishedLayoutOrder?: readonly string[],
): MailDocument {
  const sections =
    publishedLayoutOrder === undefined
      ? declaration.modelBlocks
      : orderedSections(declaration, publishedLayoutOrder);
  return { template, blocks: sections.map(modelBlock) };
}
