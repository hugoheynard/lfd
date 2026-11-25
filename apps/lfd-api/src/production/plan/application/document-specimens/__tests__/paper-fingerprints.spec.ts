import { pdfFingerprint } from "../../../../shared/print/__tests__/pdf-fingerprint.js";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { FixedSpecimenDeliveryNote } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { GetDayDossierSpecimenHandler } from "../../queries/get-day-dossier-specimen.handler.js";
import { GetProductionCountSpecimenHandler } from "../../queries/get-production-count-specimen.handler.js";

/**
 * **L'empreinte des papiers du fournil : le découpage ne change pas le rendu.**
 *
 * Chaque PDF que le fournil produit — le dossier du jour (couverture,
 * récapitulatif, calendrier, bons de commande avec leur BL, réassort), le
 * compte à produire — est rendu depuis les spécimens de la
 * planche, et le SHA-256 du FICHIER ENTIER est comparé à une valeur versionnée.
 * Un déménagement ou un découpage de code qui change un octet rougit ici.
 * La fiche d'atelier, qui appartient à l'atelier et non au plan, a sa sœur :
 * `queries/__tests__/atelier-sheet-fingerprint.spec.ts`.
 *
 * Le fichier entier, et non le seul contenu des pages : `render`
 * (`platform/pdf/paper-pdf-kit.ts`) fixe `CreationDate` et `ModDate` à
 * l'instant passé (`closedAt`, ici l'horloge figée), et l'`ID` que pdfkit
 * dérive de ces métadonnées suit donc. Rien ne dépend de l'heure murale ; les
 * métadonnées font partie de ce qu'on veut garder identique.
 *
 * L'instant est absolu, par exception (CLAUDE.md §5) : il n'est comparé à
 * aucune horloge, il est le sujet imprimé (jour de service, heure d'arrêt), et
 * une date relative changerait l'empreinte chaque jour.
 *
 * **Changement de rendu VOULU** : lancer
 *   pnpm --filter lfd-api exec jest src/production/application/document-specimens/__tests__/paper-fingerprints.spec.ts
 * relever la valeur « Received » de chaque document rouge, la recopier dans
 * `FINGERPRINTS`, et dire dans le commit pourquoi le papier a changé.
 */
const FINGERPRINTS = {
  dayDossier: "b0456763c8b4a83d12ff0dc6716a462c5ec00b4f957dd05b03e6acc384409bd4",
  dayDossierWithQr: "64cf1af6a1cd404def87414fefdc03287807b1ae7961a9c63cc4dbf5be443d31",
  productionCount: "ae2d87bb35d06986769dd95ccf739611500577940a16bc5e93bd45f310e5af39",
} as const;

const AT = new Date("2026-03-10T15:30:00.000Z");
const ADMIN_ORIGIN = "https://admin.lfc.test";

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

function fingerprint(bytes: Uint8Array): string {
  return pdfFingerprint(bytes);
}

async function dayDossier(origin: string | null): Promise<string> {
  const paper = await new GetDayDossierSpecimenHandler(
    new FixedClock(AT),
    new AdminOrigin(origin),
    new FixedPaperLogo(),
    new FixedSpecimenDeliveryNote(),
  ).execute();
  return fingerprint(paper.bytes);
}

describe("l'empreinte des papiers du fournil", () => {
  it("le dossier du jour, sans QR", async () => {
    expect(await dayDossier(null)).toBe(FINGERPRINTS.dayDossier);
  });

  it("le dossier du jour, avec les QR de colisage", async () => {
    expect(await dayDossier(ADMIN_ORIGIN)).toBe(FINGERPRINTS.dayDossierWithQr);
  });

  it("le compte à produire", async () => {
    const paper = await new GetProductionCountSpecimenHandler(
      new FixedClock(AT),
      new FixedPaperLogo(),
    ).execute();
    expect(fingerprint(paper.bytes)).toBe(FINGERPRINTS.productionCount);
  });

  it("deux rendus du même spécimen sont identiques à l'octet", async () => {
    expect(await dayDossier(ADMIN_ORIGIN)).toBe(await dayDossier(ADMIN_ORIGIN));
  });
});
