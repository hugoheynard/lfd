// Config Prisma de la db B2B commerce. Miroir du PIM.
// Prisma 7 : l'URL de connexion vit ICI (plus dans schema.prisma). Elle vient du
// `.env` propre à cette app — db DISTINCTE du PIM et de l'admin.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_LFD_URL"],
  },
});
