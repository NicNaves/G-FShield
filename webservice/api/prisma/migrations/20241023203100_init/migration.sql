-- CreateTable
CREATE TABLE "Denuncia" (
    "id" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Denuncia_pkey" PRIMARY KEY ("id")
);
