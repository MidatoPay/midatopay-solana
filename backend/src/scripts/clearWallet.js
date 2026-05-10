const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearWallet() {
  try {
     ;

    // Buscar el usuario
    const user = await prisma.user.findUnique({
      where: { email: 'barista@cafe.com' }
    });

    if (!user) {
       ;
      return;
    }

     ;
     ;

    // Limpiar la wallet
    const updatedUser = await prisma.user.update({
      where: { email: 'barista@cafe.com' },
      data: {
        walletAddress: null,
        privateKey: null,
        publicKey: null,
        walletCreatedAt: null
      }
    });

     ;
    console.log('📊 Usuario actualizado:', {
      email: updatedUser.email,
      walletAddress: updatedUser.walletAddress,
      privateKey: updatedUser.privateKey,
      publicKey: updatedUser.publicKey,
      walletCreatedAt: updatedUser.walletCreatedAt
    });

  } catch (error) {
    console.error('❌ Error limpiando wallet:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearWallet();
