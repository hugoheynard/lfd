-- Invitation d'un membre de l'équipe.
--
-- Voir `documentation/b2b/architecture-acces-staff.md` §10. Jusqu'ici une fiche
-- staff pouvait porter le statut `invited` sans que rien ne dise QUAND — donc
-- sans qu'on puisse dire si l'invitation valait encore. La colonne porte cette
-- date, et elle seule : la règle des 14 jours vit dans le code
-- (`shared/invitation/invitation-expiry.ts`), partagée avec les contacts client.
--
-- Nullable, et sans rétro-remplissage : les fiches existantes n'ont jamais été
-- invitées. Leur inventer une date d'invitation les ferait toutes périmer le
-- même jour, pour un geste qui n'a pas eu lieu.
ALTER TABLE "public"."staff_users"
  ADD COLUMN "invited_at" TIMESTAMP(3);
