import {
  FREE_BLOCK_KINDS,
  type FreeBlock,
  type MailBlock,
  type MailDocument,
  type MailTemplateDeclaration,
} from "./mail-document.js";
import { violation, type MailDocumentViolation } from "./mail-document-violation.js";
import { MODEL_SECTION_LABELS } from "./model-section-labels.js";
import { columnsViolations, freeBlockViolations } from "./validate-free-blocks.js";
import { imageSourceMissingViolations } from "./validate-image.js";
import { missingTextViolations } from "./validate-texts.js";

function allBlocks(document: MailDocument): readonly MailBlock[] {
  return document.blocks.flatMap((block): readonly MailBlock[] =>
    block.kind === "columns" ? [block, ...block.cells.flat()] : [block],
  );
}

function duplicateIdViolations(document: MailDocument): readonly MailDocumentViolation[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const block of allBlocks(document)) {
    (seen.has(block.id) ? repeated : seen).add(block.id);
  }
  return [...repeated].map((id) =>
    violation(
      "duplicate-block-id",
      id,
      `Deux blocs portent l'identifiant « ${id} » : rechargez l'éditeur avant d'enregistrer.`,
    ),
  );
}

function modelBlockViolations(
  document: MailDocument,
  declaration: MailTemplateDeclaration,
): readonly MailDocumentViolation[] {
  const placed = document.blocks.filter((block) => block.kind === "model");
  const undeclared = placed
    .filter((block) => !declaration.modelBlocks.includes(block.section))
    .map((block) =>
      violation(
        "model-block-undeclared",
        block.id,
        `Le bloc « ${MODEL_SECTION_LABELS[block.section]} » n'existe pas dans cet e-mail : retirez-le.`,
      ),
    );
  const counted = declaration.modelBlocks.flatMap((section) => {
    const count = placed.filter((block) => block.section === section).length;
    const label = MODEL_SECTION_LABELS[section];
    if (count === 0) {
      return [
        violation(
          "model-block-missing",
          null,
          `Le bloc « ${label} » manque : un bloc du modèle ne se retire pas. Revenez au modèle d'origine ou rechargez l'éditeur.`,
        ),
      ];
    }
    return count > 1
      ? [
          violation(
            "model-block-repeated",
            null,
            `Le bloc « ${label} » figure ${count} fois : un bloc du modèle n'apparaît qu'une fois. Rechargez l'éditeur.`,
          ),
        ]
      : [];
  });
  return [...undeclared, ...counted];
}

function topLevelBlockViolations(block: MailBlock): readonly MailDocumentViolation[] {
  if (block.kind === "model") {
    return [];
  }
  if (!FREE_BLOCK_KINDS.some((kind) => kind === block.kind)) {
    return [
      violation(
        "unknown-block-kind",
        block.id,
        "Ce bloc n'est pas d'une sorte que l'éditeur connaît : retirez-le, puis ajoutez-le depuis la bibliothèque.",
      ),
    ];
  }
  return block.kind === "columns" ? columnsViolations(block) : freeBlockViolations(block);
}

/**
 * **Les règles de forme d'un document**, tenues au serveur à chaque
 * enregistrement (plan `plan-editeur-par-blocs.md`, § 2) : le bon modèle ;
 * des identifiants uniques ; chaque bloc du modèle présent une fois, et aucun
 * qui ne soit pas déclaré ; des blocs libres de sortes admises ; des colonnes
 * conformes. Un document vide de refus rend `[]`.
 *
 * Un texte manquant dans une langue n'est PAS refusé ici : un brouillon peut
 * être incomplet. C'est `validateMailDocumentForPublication` qui le refuse.
 */
export function validateMailDocument(
  document: MailDocument,
  declaration: MailTemplateDeclaration,
  template: string,
): readonly MailDocumentViolation[] {
  if (document.template !== template) {
    return [
      violation(
        "template-mismatch",
        null,
        `Ce document est celui de l'e-mail « ${document.template} », pas de « ${template} » : rouvrez l'e-mail depuis la liste.`,
      ),
    ];
  }
  return [
    ...duplicateIdViolations(document),
    ...modelBlockViolations(document, declaration),
    ...document.blocks.flatMap(topLevelBlockViolations),
  ];
}

/**
 * Les règles de forme, plus celle de la publication : chaque bloc libre a son
 * texte dans chaque langue du modèle (plan, § 9, question 2, défaut). Les
 * phrases du modèle, elles, ont toujours leur texte d'origine.
 */
export function validateMailDocumentForPublication(
  document: MailDocument,
  declaration: MailTemplateDeclaration,
  template: string,
): readonly MailDocumentViolation[] {
  const shape = validateMailDocument(document, declaration, template);
  if (shape.length > 0) {
    return shape;
  }
  const freeBlocks: readonly FreeBlock[] = allBlocks(document).flatMap((block) =>
    block.kind === "model" || block.kind === "columns" ? [] : [block],
  );
  return freeBlocks.flatMap((block) => [
    ...(block.kind === "image" ? imageSourceMissingViolations(block) : []),
    ...missingTextViolations(block, declaration.locales),
  ]);
}
