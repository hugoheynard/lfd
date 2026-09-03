-- **Un seul détenteur par société — refusé par la base.**
--
-- La règle existait, juste et bien écrite (`ensureNoRivalOwner`), mais appliquée
-- sur une LECTURE faite avant l'écriture :
--
--     findOwner(companyId)              -- lecture
--     ensureNoRivalOwner(...)           -- la règle
--     attach(userId, companyId, role)   -- écriture nue
--
-- Rien entre les trois. Deux commerciaux ouvrant l'accès détenteur à la même
-- société dans la même seconde lisent tous les deux « personne », passent tous
-- les deux, et écrivent tous les deux. Le `@@unique([user_id, company_id])`
-- existant n'y peut rien : il empêche une PERSONNE d'être deux fois membre, pas
-- deux personnes d'être détenteur.
--
-- Ce n'est pas un cas d'école : ouvrir un accès client est le geste quotidien du
-- back-office depuis le 2026-08-17, et un double-clic suffit à le déclencher.
--
-- La garde applicative RESTE — c'est elle qui rend le refus lisible, avec le
-- geste de sortie (« le transfert de détention n'existe pas encore, passer par
-- le support »). L'index, lui, ferme la fenêtre qu'elle ne peut pas fermer.
--
-- **Additif et réversible** : `DROP INDEX` suffit, aucune donnée n'est touchée.
-- La pose échoue — sans rien écrire — si une société porte déjà deux
-- détenteurs ; le contrôle à passer AVANT est dans `documentation/ops/runbook.md`.
CREATE UNIQUE INDEX "memberships_one_owner"
    ON "public"."memberships" ("company_id")
 WHERE "role" = 'owner'::"public"."CustomerRole";
