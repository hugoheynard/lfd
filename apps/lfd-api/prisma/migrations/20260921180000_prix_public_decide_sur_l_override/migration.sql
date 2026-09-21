-- Le prix public DÉCIDÉ par la plateforme, en centimes TTC.
--
-- Additive et réversible : une colonne nullable, aucune donnée touchée. `NULL`
-- vaut « aucune décision », c'est-à-dire l'état de toutes les lignes existantes
-- — la sémantique d'avant est donc préservée sans conversion.
--
-- En CENTIMES et non en millicentimes : c'est un prix qu'un humain POSE, comme
-- l'étiquette du référentiel (cf. `millicents.ts`). Les millicentimes sont
-- réservés aux prix DÉRIVÉS.
--
-- Le nom porte `decided_` pour ne pas être l'homonyme de
-- `catalog_items.public_ttc_cents`, qui désigne l'étiquette REÇUE. Les deux
-- tables sont systématiquement jointes.
ALTER TABLE "public"."catalog_item_overrides"
  ADD COLUMN "decided_public_ttc_cents" INTEGER;
