const { PrismaClient } = require('@prisma/client');

// No loguear `query` por defecto: el SQL incluye columnas sensibles (password, privateKey, etc.).
// Para depurar SQL en local: PRISMA_LOG_QUERIES=true
const isProd = process.env.NODE_ENV === 'production';
const prismaLogLevels = isProd
  ? ['warn', 'error']
  : [
      ...(process.env.PRISMA_LOG_QUERIES === 'true' ? ['query'] : []),
      'info',
      'warn',
      'error',
    ];

const prisma = new PrismaClient({
  log: prismaLogLevels,
  errorFormat: isProd ? 'minimal' : 'pretty',
});

// Manejo de conexión
prisma.$connect()
  .then(() => {
     ;
  })
  .catch((error) => {
    console.error('❌ Error conectando a PostgreSQL:', error);
    process.exit(1);
  });

// Manejo graceful de desconexión
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = prisma;
