import {
  InvalidMailImageUrlError,
  MailImageOriginNotAdmittedError,
} from "../errors/mail-image.errors.js";
import { MailImageSource } from "../value-objects/mail-image-source.js";

const ADMITTED = ["https://media.lafoliecoffee.info"];
const VARIABLE = "MAIL_IMAGE_ORIGINS";

function admit(raw: string): MailImageSource {
  return MailImageSource.admit(raw, ADMITTED, VARIABLE);
}

describe("MailImageSource — seules les origines déclarées se copient", () => {
  it("admet une image d'une origine déclarée", () => {
    const source = admit("https://media.lafoliecoffee.info/products/abc.png");

    expect(source.url.href).toBe("https://media.lafoliecoffee.info/products/abc.png");
    expect(source.origin).toBe("https://media.lafoliecoffee.info");
  });

  it("refuse une autre origine, en la nommant avec la variable à régler", () => {
    expect(() => admit("https://ailleurs.example/x.png")).toThrow(MailImageOriginNotAdmittedError);
    expect(() => admit("https://ailleurs.example/x.png")).toThrow(
      /https:\/\/ailleurs\.example.*MAIL_IMAGE_ORIGINS/,
    );
  });

  it("refuse `http://`, même sur l'hôte admis", () => {
    expect(() => admit("http://media.lafoliecoffee.info/products/abc.png")).toThrow(
      MailImageOriginNotAdmittedError,
    );
  });

  it("refuse un autre port de l'hôte admis : l'origine compte le port", () => {
    expect(() => admit("https://media.lafoliecoffee.info:8443/abc.png")).toThrow(
      MailImageOriginNotAdmittedError,
    );
  });

  it("refuse un hôte qui ne fait que commencer comme l'hôte admis", () => {
    expect(() => admit("https://media.lafoliecoffee.info.evil.example/abc.png")).toThrow(
      MailImageOriginNotAdmittedError,
    );
  });

  it("refuse ce qui n'est pas une adresse", () => {
    expect(() => admit("abc.png")).toThrow(InvalidMailImageUrlError);
  });

  it("refuse une adresse qui porte des identifiants, sans les répéter", () => {
    const attempt = (): MailImageSource =>
      admit("https://moi:secret@media.lafoliecoffee.info/abc.png");

    expect(attempt).toThrow(InvalidMailImageUrlError);
    expect(attempt).not.toThrow(/secret/);
  });

  it("une liste vide (le défaut) refuse tout", () => {
    expect(() =>
      MailImageSource.admit("https://media.lafoliecoffee.info/abc.png", [], VARIABLE),
    ).toThrow(MailImageOriginNotAdmittedError);
  });
  it("admet la boucle locale en clair quand le réglage la déclare (MinIO de dev)", () => {
    const source = MailImageSource.admit(
      "http://localhost:9100/media/abc.png",
      ["http://localhost:9100"],
      VARIABLE,
    );

    expect(source.url.href).toBe("http://localhost:9100/media/abc.png");
  });
});
