// Script para limpiar y recrear wallet de un usuario
// Uso: node scripts/reset-wallet.js <userId o email>

const { PrismaClient } = require('@prisma/client');
const WalletService = require('../src/services/walletService');

const prisma = new PrismaClient();

async function resetWallet(userIdentifier) {
  try {
     ;
    
    // Buscar usuario por ID o email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userIdentifier },
          { email: userIdentifier }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
        walletAddress: true
      }
    });

    if (!user) {
      console.error('❌ Usuario no encontrado:', userIdentifier);
      process.exit(1);
    }

     ;
     ;
     ;
     ;
     ;
    
    if (user.walletAddress) {
       ;
      if (user.walletAddress.length !== 42) {
         
      }
    }

    // Limpiar wallet existente
     ;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        walletAddress: null,
        privateKey: null,
        publicKey: null,
        walletCreatedAt: null
      }
    });
     ;

    // Generar nueva wallet compatible con Polygon
     ;
    const walletData = WalletService.generateWallet();
    
     ;
     ;
     
    
    // Guardar nueva wallet
     ;
    const updatedUser = await WalletService.saveWallet(user.id, walletData);
    
     ;
     ;
     ;
     ;
     ;
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Obtener argumento de la línea de comandos
const userIdentifier = process.argv[2];

if (!userIdentifier) {
  console.error('❌ Uso: node scripts/reset-wallet.js <userId o email>');
  console.error('   Ejemplo: node scripts/reset-wallet.js barista@cafe.com');
  console.error('   Ejemplo: node scripts/reset-wallet.js cmi0emuha0001i5ermp8oeblk');
  process.exit(1);
}

resetWallet(userIdentifier);

