// Script para limpiar y recrear wallet de un usuario
// Uso: node scripts/reset-wallet.js <userId o email>

const { PrismaClient } = require('@prisma/client');
const WalletService = require('../src/services/walletService');

const prisma = new PrismaClient();

async function resetWallet(userIdentifier) {
  try {
    console.log('🔍 Buscando usuario...');
    
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

    console.log('📋 Usuario encontrado:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Nombre: ${user.name}`);
    console.log(`   Wallet actual: ${user.walletAddress || 'No tiene wallet'}`);
    
    if (user.walletAddress) {
      console.log(`   Longitud de dirección actual: ${user.walletAddress.length} caracteres`);
      if (user.walletAddress.length !== 42) {
        console.log('   ⚠️ Esta dirección no es compatible con Polygon (debe tener 42 caracteres)');
      }
    }

    // Limpiar wallet existente
    console.log('\n🗑️ Limpiando wallet existente...');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        walletAddress: null,
        privateKey: null,
        publicKey: null,
        walletCreatedAt: null
      }
    });
    console.log('✅ Wallet limpiada');

    // Generar nueva wallet compatible con Polygon
    console.log('\n🆕 Generando nueva wallet compatible con Polygon...');
    const walletData = WalletService.generateWallet();
    
    console.log('📋 Nueva wallet generada:');
    console.log(`   Dirección: ${walletData.address}`);
    console.log(`   Longitud: ${walletData.address.length} caracteres (✅ Compatible con Polygon)`);
    
    // Guardar nueva wallet
    console.log('\n💾 Guardando nueva wallet...');
    const updatedUser = await WalletService.saveWallet(user.id, walletData);
    
    console.log('\n✅ Wallet recreada exitosamente!');
    console.log('📋 Detalles:');
    console.log(`   Usuario: ${updatedUser.email}`);
    console.log(`   Nueva dirección: ${updatedUser.walletAddress}`);
    console.log(`   Creada en: ${updatedUser.walletCreatedAt}`);
    
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

