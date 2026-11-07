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
  MAIL_SPACE_LABELS,
  MAIL_SPACES,
  isMailSpace,
  mailSpaceOfCharter,
  type MailSpace,
} from "./mail-spaces.js";
export type {
  MailCharterColors,
  MailCharterDarkColors,
  MailCharterFont,
  MailCharterLogo,
  MailCharterSettings,
} from "./charter-settings.js";
export { MIN_TEXT_CONTRAST, contrastRatio, isHexColor } from "./contrast.js";
export { CHARTER_CONTRAST_PAIRS, type CharterContrastPair } from "./charter-contrast-pairs.js";
export {
  MAIL_CHARTER_VIOLATION_CODES,
  validateMailCharter,
  validateMailCharterForPublication,
  type MailCharterViolation,
  type MailCharterViolationCode,
} from "./validate-charter.js";
export type {
  MailCharterDraftPayload,
  MailCharterHistoryView,
  MailCharterPreviewPayload,
  MailCharterPreviewView,
  MailCharterPublicationView,
  MailCharterPublishPayload,
  MailCharterPublishedView,
  MailCharterSource,
  MailCharterVersionView,
  MailCharterView,
} from "./mail-charter-routes.js";
export {
  CALLOUT_TONES,
  COLUMN_COUNTS,
  FREE_BLOCK_KINDS,
  SHORT_BLOCK_KINDS,
  isEditablePhrase,
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
export { imageBlocksOf, imageCopiesOf, withImageSources } from "./image-sources.js";
export {
  DEFAULT_IMAGE_FOCAL,
  IMAGE_FORMAT_RATIOS,
  IMAGE_FORMATS,
  framingOf,
  imageCopyKey,
  isImageFocal,
  isImageFormat,
  type ImageCropFormat,
  type ImageFocal,
  type ImageFormat,
  type ImageFraming,
} from "./image-framing.js";
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
  type MailBlockPreviewFragment,
  type MailDocumentBlockPreviewPayload,
  type MailDocumentBlockPreviewView,
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
export {
  MAIL_DATA_BLOCK_IDS,
  MAIL_LINK_SLOTS,
  MAIL_PREVIEW_SITUATIONS,
  type MailDataBlockId,
  type MailDataBlockResource,
  type MailEditorResources,
  type MailLinkResource,
  type MailLinkSlot,
  type MailPreviewSituation,
  type MailResourceCard,
  type MailValueResource,
} from "./mail-resources.js";
export {
  MAIL_SENDER_VIOLATION_CODES,
  MAX_SENDER_ADDRESS_LENGTH,
  MAX_SENDER_NAME_LENGTH,
  senderDomainOf,
  senderHeaderOf,
  validateMailSenderIdentity,
  validateStoredMailSenderIdentity,
  isUnattendedAddress,
  UNATTENDED_LOCAL_PARTS,
  type MailSenderDefaultView,
  type MailSenderField,
  type MailSenderIdentity,
  type MailSenderPayload,
  type MailSenderView,
  type MailSenderViolation,
  type MailSenderViolationCode,
} from "./mail-sender-identity.js";
