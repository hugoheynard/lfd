import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { png } from "./seeds.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF", "latin1");

/** Les pièces déposées : documents légaux, photos de contrôle qualité. */
export const DOCUMENTS_SCENARIOS: ScenarioSet = {
  [routeKey("lafoliecoffee/content/http/admin-legal-document-files.controller.ts", "deposit")]:
    () =>
      Promise.resolve({
        sub: STAFF,
        path: "/admin/content/legal/salesTerms/files",
        files: [
          { field: "file", content: PDF, filename: "cgv.pdf", contentType: "application/pdf" },
        ],
      }),

  [routeKey("production/http/production-quality.controller.ts", "deposit")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/supervision/quality/photos",
      files: [
        {
          field: "photo",
          content: png(640, 480),
          filename: "fournee.png",
          contentType: "image/png",
        },
      ],
    }),
};
