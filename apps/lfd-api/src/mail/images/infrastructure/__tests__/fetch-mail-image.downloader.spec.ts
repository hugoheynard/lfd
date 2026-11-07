import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  MailImageDownloadFailedError,
  MailImageTooLargeError,
} from "../../domain/errors/mail-image.errors.js";
import { FetchMailImageDownloader } from "../fetch-mail-image.downloader.js";

/**
 * Un vrai serveur local : le téléchargeur est éprouvé sur un vrai `fetch`.
 * Le schéma n'est pas son affaire (la source admise l'a déjà vérifié), d'où
 * le clair en boucle locale ici.
 */
const ROUTES: Record<string, (res: ServerResponse) => void> = {
  "/ok": (res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from([1, 2, 3, 4]));
  },
  "/announced-too-big": (res) => {
    res.writeHead(200, { "content-length": "1000" });
    res.end(Buffer.alloc(1000));
  },
  "/streamed-too-big": (res) => {
    res.writeHead(200);
    res.write(Buffer.alloc(60));
    res.end(Buffer.alloc(60));
  },
  "/missing": (res) => {
    res.writeHead(404);
    res.end();
  },
  "/redirect": (res) => {
    res.writeHead(302, { location: "/ok" });
    res.end();
  },
  "/slow": () => {
    // ne répond jamais : le délai doit trancher.
  },
};

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => ROUTES[req.url ?? ""]?.(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const LIMITS = { maxBytes: 100, timeoutMs: 500 };

function download(path: string): Promise<Buffer> {
  return new FetchMailImageDownloader().download(new URL(path, base), LIMITS);
}

describe("FetchMailImageDownloader — un téléchargement borné", () => {
  it("rend les octets", async () => {
    expect([...(await download("/ok"))]).toEqual([1, 2, 3, 4]);
  });

  it("refuse une taille annoncée au-delà de la borne", async () => {
    await expect(download("/announced-too-big")).rejects.toBeInstanceOf(MailImageTooLargeError);
  });

  it("coupe le flux dès que la borne est franchie, sans en-tête de taille", async () => {
    await expect(download("/streamed-too-big")).rejects.toBeInstanceOf(MailImageTooLargeError);
  });

  it("une réponse non 2xx est un échec de téléchargement", async () => {
    await expect(download("/missing")).rejects.toThrow(/réponse 404/);
  });

  it("ne suit pas une redirection : elle mènerait hors de l'origine admise", async () => {
    await expect(download("/redirect")).rejects.toBeInstanceOf(MailImageDownloadFailedError);
  });

  it("abandonne au-delà du délai", async () => {
    await expect(download("/slow")).rejects.toThrow(/délai dépassé/);
  });
});
