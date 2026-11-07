import { Injectable } from "@nestjs/common";

import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";
import {
  MailImageDownloadFailedError,
  MailImageTooLargeError,
} from "../domain/errors/mail-image.errors.js";
import { type DownloadLimits, MailImageDownloader } from "../domain/ports/mail-image.downloader.js";

/**
 * Le téléchargeur des images à copier, par `fetch` (§ 24 du plan du service
 * d'e-mails). Le lot S3c, dont il devait être le téléchargeur, n'est pas bâti
 * (vérifié le 2026-11-07) : il vit donc ici.
 *
 * - **Pas de redirection suivie** : l'origine admise est celle qu'on a vérifiée ;
 *   une redirection mènerait ailleurs sans repasser par la liste.
 * - **Taille bornée en lisant** : l'en-tête `Content-Length` est un indice, pas
 *   une garantie ; le flux est coupé dès que la borne est franchie.
 */
@Injectable()
export class FetchMailImageDownloader extends MailImageDownloader {
  async download(url: URL, limits: DownloadLimits): Promise<Buffer> {
    assertOutsideTransaction("mail.image.download");
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(limits.timeoutMs),
      });
    } catch (error) {
      throw new MailImageDownloadFailedError(url.origin, failureReason(error), error);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new MailImageDownloadFailedError(url.origin, `réponse ${response.status}`);
    }
    const announced = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(announced) && announced > limits.maxBytes) {
      await response.body?.cancel();
      throw new MailImageTooLargeError(limits.maxBytes);
    }
    try {
      return await readCapped(response, limits.maxBytes);
    } catch (error) {
      if (error instanceof MailImageTooLargeError) {
        throw error;
      }
      throw new MailImageDownloadFailedError(url.origin, failureReason(error), error);
    }
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (response.body === null) {
    return Buffer.alloc(0);
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks, total);
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new MailImageTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
}

/**
 * La raison lue sur le NOM de l'erreur : l'abandon sur délai est une
 * `DOMException`, qui n'est pas toujours un `Error` du même royaume.
 */
function failureReason(error: unknown): string {
  const name: unknown =
    typeof error === "object" && error !== null ? Reflect.get(error, "name") : undefined;
  if (name === "TimeoutError") {
    return "délai dépassé";
  }
  return typeof name === "string" ? name : "erreur inconnue";
}
