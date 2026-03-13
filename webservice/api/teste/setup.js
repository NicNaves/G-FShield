const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = async () => {
  console.log("Iniciando setup de teste...");

  await prisma.graspExecutionEvent.deleteMany();
  await prisma.graspExecutionRun.deleteMany();
  await prisma.graspExecutionLaunch.deleteMany();
  await prisma.user.deleteMany();

  console.log("Banco de dados limpo para testes.");
  await prisma.$disconnect();
};
