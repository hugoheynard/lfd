// Config Prisma du **référentiel PIM**, second client de cette application.
//
// Deux clients dans un seul processus, sur deux bases : c'est l'étape B2b de
// `documentation/suite/architecture-topologie-apps.md`. Elle donne la fusion des
// processus SANS aucune migration de données — les deux bases restent où elles
// sont, et la consolidation en schémas viendra plus tard (B4), séparément.
//
// ⚠️ Le schéma est une **copie** de `apps/lfc-PIM-backend/prisma/schema.prisma`,
// le temps que le PIM déménage (B2c). Prisma déclare la sortie du générateur
// DANS le schéma, donc pointer directement celui du PIM écrirait le client chez
// lui. La copie est tenue par le gate `lint:pim-schema-parity`, qui échoue si
// les deux divergent — sans quoi cette duplication serait exactement le genre de
// dette qui pourrit en silence.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/pim/schema.prisma",
  datasource: {
    url: process.env["DATABASE_PIM_URL"],
  },
});
