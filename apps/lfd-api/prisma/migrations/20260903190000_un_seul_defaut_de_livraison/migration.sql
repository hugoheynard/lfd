-- **Un seul défaut de livraison par société — refusé par la base.**
--
-- La règle existait déjà, deux fois : dans `DeliveryAddressBook`, qui ne sait pas
-- exprimer deux défauts, et avant lui dans quatre méthodes SQL d'un adaptateur
-- qui démotaient les lignes à la main. Cet index est le barreau du dessus : même
-- un `UPDATE` passé à côté du domaine — une correction manuelle, un script, un
-- futur adaptateur — se fait refuser.
--
-- **Ce qu'il ne dit pas**, et ce n'est pas un oubli : « au moins un défaut ». Un
-- index unique ne compte pas jusqu'à un ; seul le carnet garantit qu'une liste
-- non vide en a toujours un. Les deux moitiés de la règle vivent donc à deux
-- endroits, et c'est le mieux que la base permette.
--
-- **Additif et réversible** : `DROP INDEX` suffit à revenir en arrière, aucune
-- donnée n'est touchée. La pose échoue — sans rien écrire — si une société porte
-- déjà deux défauts ; c'est voulu, et c'est pourquoi le contrôle de
-- `documentation/ops/runbook.md` se passe AVANT le déploiement.
CREATE UNIQUE INDEX "addresses_one_default_delivery"
    ON "public"."addresses" ("company_id")
 WHERE "kind" = 'delivery'::"public"."AddressKind"
   AND "is_default"
   AND "archived_at" IS NULL;
