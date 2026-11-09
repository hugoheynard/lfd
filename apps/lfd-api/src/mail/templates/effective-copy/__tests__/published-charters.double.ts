import type { MailCopyOverlay } from "../../copy/mail-copy-overlay.js";
import type { MailSectionOrders } from "../../sections/mail-layout-scope.js";
import type { PublishedMailCharters } from "../published-mail-charters.js";
import { PublishedMailCopyReader } from "../published-mail-copy.reader.js";
import type { PublishedMailDocuments } from "../published-mail-documents.js";
import {
  NO_PUBLISHED_MAIL_SENDERS,
  type PublishedMailSendersByNature,
} from "../published-mail-senders.js";

/**
 * Le publié réduit à ses chartes : rien d'autre n'est publié. Une `Error`
 * fait échouer la lecture des chartes, comme une base qui ne répond pas.
 */
export class PublishedChartersOnly extends PublishedMailCopyReader {
  constructor(private readonly published: PublishedMailCharters | Error = {}) {
    super();
  }
  read(): Promise<MailCopyOverlay> {
    return Promise.resolve({});
  }
  sectionOrders(): Promise<MailSectionOrders> {
    return Promise.resolve({});
  }
  documents(): Promise<PublishedMailDocuments> {
    return Promise.resolve({});
  }
  senders(): Promise<PublishedMailSendersByNature> {
    return Promise.resolve(NO_PUBLISHED_MAIL_SENDERS);
  }
  charters(): Promise<PublishedMailCharters> {
    return this.published instanceof Error
      ? Promise.reject(this.published)
      : Promise.resolve(this.published);
  }
}
