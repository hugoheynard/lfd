/**
 * `@lfd/mail-blocks` — le contrat de l'éditeur d'e-mails par blocs (plan
 * `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, S4a).
 * Importé par l'API et le back-office seulement.
 */
export {
  COLUMN_WIDTH_STEPS,
  isColumnWidthStep,
  widthsFillTheRow,
  type ColumnWidthStep,
} from "./column-widths.js";
export { MAIL_CHARTERS, type MailCharter } from "./mail-charter.js";
export {
  CALLOUT_TONES,
  COLUMN_COUNTS,
  FREE_BLOCK_KINDS,
  SHORT_BLOCK_KINDS,
  type ButtonBlock,
  type CalloutBlock,
  type CalloutTone,
  type ColumnsBlock,
  type DividerBlock,
  type FreeBlock,
  type ImageBlock,
  type MailBlock,
  type MailDocument,
  type MailTemplateDeclaration,
  type ModelBlock,
  type TextBlock,
} from "./mail-document.js";
export {
  MAIL_DOCUMENT_VIOLATION_CODES,
  type MailDocumentViolation,
  type MailDocumentViolationCode,
} from "./mail-document-violation.js";
export { MAIL_LOCALES, type Localized, type MailLocale } from "./mail-locales.js";
export { MODEL_SECTION_LABELS } from "./model-section-labels.js";
export {
  MODEL_SECTIONS,
  isModelSectionId,
  modelSectionOfLayoutSection,
  type ModelSectionId,
} from "./model-sections.js";
export { modelBlockId, startingMailDocument } from "./starting-document.js";
export { imageBlocksOf, withImageSources } from "./image-sources.js";
export { isHttpsUrl, isImageSourceUrl } from "./urls.js";
export {
  validateMailDocument,
  validateMailDocumentForPublication,
} from "./validate-mail-document.js";
export {
  MAIL_AUDIENCES,
  MAIL_DOCUMENT_SOURCES,
  MAIL_FAMILIES,
  type MailAudience,
  type MailDocumentCasePreviewPayload,
  type MailDocumentDraftPayload,
  type MailDocumentHistoryView,
  type MailDocumentPreviewAttachment,
  type MailDocumentPreviewPayload,
  type MailDocumentPreviewView,
  type MailDocumentPublicationView,
  type MailDocumentPublishPayload,
  type MailDocumentRevertPayload,
  type MailDocumentSource,
  type MailDocumentSourcedTrialPayload,
  type MailDocumentTrialPayload,
  type MailDocumentVersionView,
  type MailEditorCaseView,
  type MailEditorDefaultChangeView,
  type MailEditorFrame,
  type MailEditorListItem,
  type MailEditorListView,
  type MailEditorPhraseLocaleView,
  type MailEditorPhrasePlace,
  type MailEditorPhraseView,
  type MailEditorPhrasesView,
  type MailEditorPublishedView,
  type MailEditorStamp,
  type MailEditorView,
  type MailFamily,
  type MailPhraseDraftPayload,
  type MailPhraseDraftState,
  type MailPhraseResetPayload,
} from "./mail-editor-routes.js";
