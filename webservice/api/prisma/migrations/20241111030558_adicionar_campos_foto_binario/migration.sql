/*
  Warnings:

  - You are about to drop the column `endereco` on the `Denuncia` table. All the data in the column will be lost.
  - Added the required column `enderecoId` to the `Denuncia` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tipoCriadouro` to the `Denuncia` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Denuncia` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Denuncia" DROP COLUMN "endereco",
ADD COLUMN     "confirmacao" BOOLEAN,
ADD COLUMN     "dataHoraRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "enderecoId" INTEGER NOT NULL,
ADD COLUMN     "observacaoDecisao" TEXT,
ADD COLUMN     "tipoCriadouro" TEXT NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'Inicial';

-- CreateTable
CREATE TABLE "Endereco" (
    "id" SERIAL NOT NULL,
    "endereco" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Endereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" SERIAL NOT NULL,
    "dados" BYTEA NOT NULL,
    "denunciaId" INTEGER NOT NULL,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Denuncia" ADD CONSTRAINT "Denuncia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Denuncia" ADD CONSTRAINT "Denuncia_enderecoId_fkey" FOREIGN KEY ("enderecoId") REFERENCES "Endereco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_denunciaId_fkey" FOREIGN KEY ("denunciaId") REFERENCES "Denuncia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
