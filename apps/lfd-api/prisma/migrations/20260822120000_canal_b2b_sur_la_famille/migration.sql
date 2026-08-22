-- La plateforme B2B devient un canal de la famille, avec SON taux.
--
-- Jusqu'ici la projection B2B facturait au taux « à emporter » de la famille
-- (`projection.ts` lisait `emporterVatPercent`) : un emprunt que rien ne
-- signalait, et qu'aucun écran ne permettait de corriger. Vendre à un
-- professionnel n'est ni « à emporter » ni « sur place ».
--
-- `NULL` = non réglé, comme les deux autres. Rien n'est rétro-rempli : recopier
-- le taux « à emporter » figerait l'emprunt en décision, alors que c'est
-- justement ce qu'on arrête de faire. Une famille non réglée n'est pas vendable
-- sur le canal, et le catalogue l'écarte plutôt que d'inventer un taux.
ALTER TABLE "pim"."category" ADD COLUMN "b2b_tva_id" TEXT;

ALTER TABLE "pim"."category"
  ADD CONSTRAINT "category_b2b_tva_id_fkey"
  FOREIGN KEY ("b2b_tva_id") REFERENCES "pim"."tva_rate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le même `RESTRICT` que les deux autres relations : un taux visé par une
-- famille ne se supprime pas. L'index sert ce contrôle et la lecture d'usages.
CREATE INDEX "category_b2b_tva_id_idx" ON "pim"."category" ("b2b_tva_id");

-- La grille de canaux (`channel_preset`, jsonb) gagne une clé `b2b`. Les lignes
-- existantes ne sont PAS migrées : `readSalesChannelsColumn` relit une clé
-- absente comme « pas vendu », ce qui est l'état vrai de ces familles — aucune
-- n'a jamais été cochée pour un canal qui n'existait pas.
