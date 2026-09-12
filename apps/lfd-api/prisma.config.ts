// Config Prisma de la db B2B commerce. Miroir du PIM.
// `schema` désigne un DOSSIER depuis le 2026-09-10 : Prisma fusionne tous les
// `.prisma` qu'il contient, sous-dossiers compris (cf. prisma/schema/datasource.prisma).
// Prisma 7 : l'URL de connexion vit ICI (plus dans le schéma). Elle vient du
// `.env` propre à cette app. ⚠️ « db DISTINCTE du PIM » disait la ligne d'avant :
// une seule base porte les cinq schémas depuis B4 (vérifié le 2026-09-10).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_LFD_URL"],
  },
});
