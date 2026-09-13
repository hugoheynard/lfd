-- LE POSTE DE COLISAGE — de quoi cocher une ligne au moment où elle entre
-- dans le bac du client.
--
-- Strictement ADDITIVE : trois colonnes sur une table existante, deux nullables
-- et une à défaut vide. Aucune colonne supprimée, aucun renommage, aucune
-- donnée déplacée. Les binaires en place continuent de lire et d'écrire
-- `production_order_line` sans rien savoir de ces colonnes.
--
-- Le retour arrière est le `DROP` symétrique, et il ne perd que ce que le poste
-- de colisage a écrit — le détail du remplissage, jamais la fermeture du bac,
-- qui vit sur `production_order.packed_at` et n'est pas touchée ici.
--
-- ⚠️ **Aucune colonne de ressource.** Le reste à répartir se calcule à la
-- lecture (`production_count.quantity` moins la somme des lignes cochées du
-- jour). Le stocker créerait un second endroit où la vérité peut dériver, pour
-- économiser une agrégation sur quelques dizaines de lignes.
--
-- `packed_at = NULL` est le seul état « pas dans le bac ». L'auteur
-- l'accompagne, pour la raison que `done_by` porte déjà sur le compte à
-- produire : un fait daté sans auteur ne se conteste pas, il s'efface. Les
-- initiales, elles, sont à DÉFAUT vide et non nullables — une ligne peut être
-- mise au bac sans signature (on coche d'abord, on signe si on veut), et un
-- troisième nullable laisserait croire à un quatrième état qui n'existe pas.
ALTER TABLE "production"."production_order_line"
    ADD COLUMN IF NOT EXISTS "packed_at"       TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "packed_by"       TEXT,
    ADD COLUMN IF NOT EXISTS "packed_initials" TEXT NOT NULL DEFAULT '';
