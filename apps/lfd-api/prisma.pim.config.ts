// Config Prisma du **référentiel PIM**, second client de cette application.
//
// Deux clients dans un seul processus, sur deux bases : c'est l'étape B2 de
// `documentation/suite/architecture-topologie-apps.md`. Elle donne la fusion des
// processus SANS aucune migration de données — les deux bases restent où elles
// sont, et la consolidation en schémas viendra plus tard (B4), séparément.
//
// Ce schéma n'est plus une copie : c'est l'original, arrivé avec le référentiel
// (B2c). Le gate `lint:pim-schema-parity` qui tenait la copie a donc disparu
// avec elle — un gate temporaire qui survit à son motif devient un meuble.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/pim/schema.prisma",
  migrations: {
    path: "prisma/pim/migrations",
    seed: "tsx prisma/pim/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_PIM_URL"],
  },
});
