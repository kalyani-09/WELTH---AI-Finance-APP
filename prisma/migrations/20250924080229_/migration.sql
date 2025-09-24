/*
  Warnings:

  - A unique constraint covering the columns `[id,userId]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "transactions_id_userId_key" ON "public"."transactions"("id", "userId");
