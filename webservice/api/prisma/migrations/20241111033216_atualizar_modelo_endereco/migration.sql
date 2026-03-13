/*
  Warnings:

  - You are about to drop the column `endereco` on the `Endereco` table. All the data in the column will be lost.
  - Added the required column `bairro` to the `Endereco` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cep` to the `Endereco` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cidade` to the `Endereco` table without a default value. This is not possible if the table is not empty.
  - Added the required column `estado` to the `Endereco` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numero` to the `Endereco` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rua` to the `Endereco` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Endereco" DROP COLUMN "endereco",
ADD COLUMN     "bairro" TEXT NOT NULL,
ADD COLUMN     "cep" TEXT NOT NULL,
ADD COLUMN     "cidade" TEXT NOT NULL,
ADD COLUMN     "estado" TEXT NOT NULL,
ADD COLUMN     "numero" TEXT NOT NULL,
ADD COLUMN     "rua" TEXT NOT NULL;
