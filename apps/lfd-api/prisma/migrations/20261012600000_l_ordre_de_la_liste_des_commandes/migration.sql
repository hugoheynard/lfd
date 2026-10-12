-- L'ordre de la liste staff des commandes (plan
-- documentation/order/plan-page-commandes.md, lot C1).
--
-- `GET /admin/orders` trie par `created_at DESC, id DESC` et pagine par clé
-- (« strictement après la dernière ligne rendue »). Sans index, chaque page
-- trie toute la table `orders` ; avec, elle descend l'index et s'arrête à
-- `limit + 1` lignes. Les filtres (statut, règlement, jour de retrait, société)
-- ont déjà leur index ; la clientèle et le mode, à deux valeurs chacun, n'en
-- gagneraient rien.
--
-- ADDITIVE : un index, aucune donnée touchée, aucun droit accordé.
-- Retour arrière : `DROP INDEX "public"."orders_created_at_id_idx"`.

CREATE INDEX "orders_created_at_id_idx" ON "public"."orders"("created_at" DESC, "id" DESC);
