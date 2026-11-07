import {
  MailImageNotAnImageError,
  MailImageOriginNotAdmittedError,
  MailImageTooLargeError,
} from "../../domain/errors/mail-image.errors.js";
import {
  type DownloadLimits,
  MailImageDownloader,
} from "../../domain/ports/mail-image.downloader.js";
import { type MailImageCopy, MailImageStore } from "../../domain/ports/mail-image.store.js";
import { MAIL_IMAGE_MAX_BYTES } from "../../domain/value-objects/mail-image-source.js";
import { MailImageCopier } from "../mail-image-copier.service.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SOURCE = "https://media.lafoliecoffee.info/products/logo.png";

/** Un téléchargeur qui rend des octets fixés, ou refuse comme le vrai au-delà de la borne. */
class StubDownloader extends MailImageDownloader {
  readonly calls: { url: string; limits: DownloadLimits }[] = [];

  constructor(private readonly bytes: Buffer) {
    super();
  }

  download(url: URL, limits: DownloadLimits): Promise<Buffer> {
    this.calls.push({ url: url.href, limits });
    if (this.bytes.byteLength > limits.maxBytes) {
      return Promise.reject(new MailImageTooLargeError(limits.maxBytes));
    }
    return Promise.resolve(this.bytes);
  }
}

/** Un stockage adressé par contenu, en mémoire : mêmes octets, même adresse. */
class MemoryStore extends MailImageStore {
  readonly objects = new Map<string, string>();

  put(bytes: Buffer, contentType: string): Promise<MailImageCopy> {
    const url = `https://mail.example/templates/${bytes.toString("hex")}`;
    this.objects.set(url, contentType);
    return Promise.resolve({ url });
  }
}

function copier(bytes: Buffer, store = new MemoryStore()) {
  const downloader = new StubDownloader(bytes);
  const service = new MailImageCopier(
    {
      origins: ["https://media.lafoliecoffee.info"],
      originsVariable: "MAIL_IMAGE_ORIGINS",
      publicBaseUrl: "https://mail.example",
    },
    downloader,
    store,
  );
  return { service, downloader, store };
}

describe("MailImageCopier — la copie d'une image de modèle", () => {
  it("télécharge, vérifie par les octets, range, et rend l'adresse de la copie", async () => {
    const { service, downloader, store } = copier(PNG);

    const copy = await service.copy(SOURCE);

    expect(downloader.calls).toHaveLength(1);
    expect(downloader.calls[0]?.limits.maxBytes).toBe(MAIL_IMAGE_MAX_BYTES);
    expect(store.objects.get(copy.url)).toBe("image/png");
  });

  it("refuse une origine non admise SANS rien télécharger", async () => {
    const { service, downloader } = copier(PNG);

    await expect(service.copy("https://ailleurs.example/logo.png")).rejects.toBeInstanceOf(
      MailImageOriginNotAdmittedError,
    );
    expect(downloader.calls).toHaveLength(0);
  });

  it("refuse `http://` sans rien télécharger", async () => {
    const { service, downloader } = copier(PNG);

    await expect(
      service.copy("http://media.lafoliecoffee.info/products/logo.png"),
    ).rejects.toBeInstanceOf(MailImageOriginNotAdmittedError);
    expect(downloader.calls).toHaveLength(0);
  });

  it("refuse une image trop lourde, et ne range rien", async () => {
    const { service, store } = copier(Buffer.alloc(MAIL_IMAGE_MAX_BYTES + 1, 0x89));

    await expect(service.copy(SOURCE)).rejects.toBeInstanceOf(MailImageTooLargeError);
    expect(store.objects.size).toBe(0);
  });

  it("refuse des octets qui ne sont pas une image, quelle que soit l'extension", async () => {
    const { service, store } = copier(Buffer.from("<html>pas une image</html>"));

    await expect(service.copy(SOURCE)).rejects.toBeInstanceOf(MailImageNotAnImageError);
    expect(store.objects.size).toBe(0);
  });

  it("refuse un PDF : reconnu par ses octets, mais pas une image d'e-mail", async () => {
    const { service } = copier(Buffer.from("%PDF-1.7\n…"));

    await expect(service.copy(SOURCE)).rejects.toBeInstanceOf(MailImageNotAnImageError);
  });

  it("la même image copiée deux fois rend la même adresse", async () => {
    const store = new MemoryStore();
    const first = await copier(PNG, store).service.copy(SOURCE);
    const second = await copier(PNG, store).service.copy(`${SOURCE}?v=2`);

    expect(second.url).toBe(first.url);
    expect(store.objects.size).toBe(1);
  });

  it("une adresse déjà sous l'adresse publique du bloc est une copie : rendue telle quelle, sans réseau", async () => {
    const { service, downloader, store } = copier(PNG);
    const own = "https://mail.example/templates/abc.png";

    await expect(service.copy(own)).resolves.toEqual({ url: own });
    expect(downloader.calls).toHaveLength(0);
    expect(store.objects.size).toBe(0);
  });

  it("une origine qui ne fait que commencer comme l'adresse publique n'en est pas une", async () => {
    const { service } = copier(PNG);

    await expect(service.copy("https://mail.example.evil/a.png")).rejects.toBeInstanceOf(
      MailImageOriginNotAdmittedError,
    );
  });
});
