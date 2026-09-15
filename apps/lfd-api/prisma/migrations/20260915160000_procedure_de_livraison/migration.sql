-- **La procédure de livraison d'une adresse** — plan
-- `documentation/b2b/plan-procedure-de-livraison.md` §2.1.
--
-- ## Additive
--
-- Deux tables neuves, aucune colonne existante touchée, aucune donnée déplacée.
-- Une adresse sans ligne ici se lit comme une procédure vide : l'état d'avant
-- ce déploiement est donc lu à l'identique.
--
-- Retour arrière : `DROP TABLE "public"."delivery_procedure_steps";` puis
-- `DROP TABLE "public"."delivery_procedures";` — à ne faire que tant qu'aucune
-- étape n'a été saisie, puisque ce serait détruire les consignes d'un client.
--
-- ## Deux choix qui se lisent ici
--
-- - **Pas d'unique sur `(procedure_id, position)`.** Un réordonnancement
--   réécrit toutes les positions, et un unique non différé ferait échouer
--   l'échange de deux lignes. L'ordre est tenu par l'agrégat
--   `DeliveryProcedure`, qui réécrit `0..n-1` à chaque enregistrement.
-- - **`ON DELETE CASCADE` des étapes.** La racine ne se supprime jamais (§2.2) :
--   la cascade ne sert qu'à ne pas laisser d'orphelins si ce retour arrière est
--   un jour joué. Les adresses ne se suppriment pas non plus — `RESTRICT` le
--   rappelle.

-- CreateTable
CREATE TABLE "public"."delivery_procedures" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."delivery_procedure_steps" (
    "id" TEXT NOT NULL,
    "procedure_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "photo_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_procedure_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_procedures_address_id_key" ON "public"."delivery_procedures"("address_id");

-- CreateIndex
CREATE INDEX "delivery_procedure_steps_procedure_id_position_idx" ON "public"."delivery_procedure_steps"("procedure_id", "position");

-- AddForeignKey
ALTER TABLE "public"."delivery_procedures" ADD CONSTRAINT "delivery_procedures_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."delivery_procedure_steps" ADD CONSTRAINT "delivery_procedure_steps_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."delivery_procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
