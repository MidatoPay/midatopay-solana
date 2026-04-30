const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { Keypair } = require("@solana/web3.js");

const prisma = new PrismaClient();

class WalletService {
  static ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || "midatopay-wallet-key-2024-secure-32bytes!!";
  static ALGORITHM = "aes-256-cbc";

  static getEncryptionKey() {
    if (this.ENCRYPTION_KEY.length >= 32) {
      return Buffer.from(this.ENCRYPTION_KEY.substring(0, 32), "utf8");
    }

    return crypto.createHash("sha256").update(this.ENCRYPTION_KEY).digest();
  }

  static generateWallet() {
    const keypair = Keypair.generate();
    const secretKey = JSON.stringify(Array.from(keypair.secretKey));
    const publicKey = keypair.publicKey.toBase58();

    return {
      address: publicKey,
      privateKey: secretKey,
      publicKey,
      createdAt: new Date().toISOString(),
      network: "solana",
    };
  }

  static encryptPrivateKey(privateKey) {
    const iv = crypto.randomBytes(16);
    const key = this.getEncryptionKey();
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    let encrypted = cipher.update(privateKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
  }

  static decryptPrivateKey(encryptedData) {
    const [ivHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = this.getEncryptionKey();
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  static async saveWallet(userId, walletData) {
    const encryptedPrivateKey = this.encryptPrivateKey(walletData.privateKey);

    return prisma.user.update({
      where: { id: userId },
      data: {
        walletAddress: walletData.address,
        privateKey: encryptedPrivateKey,
        publicKey: walletData.publicKey,
        walletCreatedAt: new Date(walletData.createdAt),
      },
    });
  }

  static async getWallet(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          walletAddress: true,
          privateKey: true,
          publicKey: true,
          walletCreatedAt: true,
        },
      });

      if (!user || !user.walletAddress) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        address: user.walletAddress,
        privateKey: this.decryptPrivateKey(user.privateKey),
        publicKey: user.publicKey,
        createdAt: user.walletCreatedAt?.toISOString(),
        network: "solana",
      };
    } catch (error) {
      console.error("? Error obteniendo wallet de BD:", error);
      return null;
    }
  }

  static async hasWallet(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { walletAddress: true },
      });
      return Boolean(user && user.walletAddress);
    } catch (error) {
      console.error("? Error verificando wallet:", error);
      return false;
    }
  }

  static async clearWallet(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        walletAddress: null,
        privateKey: null,
        publicKey: null,
        walletCreatedAt: null,
      },
    });
  }

  static async getUserByEmail(email) {
    try {
      return await prisma.user.findUnique({ where: { email } });
    } catch (error) {
      console.error("? Error obteniendo usuario por email:", error);
      return null;
    }
  }

  static async createUserWithWallet(userData, walletData) {
    const encryptedPrivateKey = this.encryptPrivateKey(walletData.privateKey);

    return prisma.user.create({
      data: {
        email: userData.email,
        password: userData.password,
        name: userData.name,
        phone: userData.phone,
        walletAddress: walletData.address,
        privateKey: encryptedPrivateKey,
        publicKey: walletData.publicKey,
        walletCreatedAt: new Date(walletData.createdAt),
      },
    });
  }
}

module.exports = WalletService;
