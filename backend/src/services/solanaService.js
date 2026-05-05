const fs = require("fs");
const path = require("path");
const os = require("os");

const anchor = require("@coral-xyz/anchor");
const { AnchorProvider, Wallet, BorshCoder, BN } = anchor;
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} = require("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");

const idlDir = path.join(__dirname, "..", "..", "contracts", "target", "idl");
const gatewayIdl = require(path.join(idlDir, "payment_gateway.json"));
const oracleIdl = require(path.join(idlDir, "dynamic_fx_oracle.json"));

const DEFAULT_COMMITMENT = process.env.SOLANA_COMMITMENT || "confirmed";
const DEFAULT_CLUSTER = (process.env.SOLANA_CLUSTER || "testnet").toLowerCase();
const DEFAULT_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(DEFAULT_CLUSTER);
const DEFAULT_WALLET_PATH = process.env.SOLANA_WALLET_PATH || "~/.config/solana/devnet-alt.json";
const DEFAULT_GATEWAY_PROGRAM_ID = process.env.SOLANA_PAYMENT_GATEWAY_PROGRAM_ID || gatewayIdl.address;
const DEFAULT_ORACLE_PROGRAM_ID = process.env.SOLANA_ORACLE_PROGRAM_ID || oracleIdl.address;
const DEFAULT_TOKEN_PROGRAM_ID = process.env.SOLANA_TOKEN_PROGRAM_ID || TOKEN_PROGRAM_ID.toBase58();

function expandHome(filePath) {
  if (!filePath) {
    return filePath;
  }

  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

function loadWalletFromFile(walletPath = DEFAULT_WALLET_PATH) {
  const resolvedPath = expandHome(walletPath);
  const secretKey = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return new Wallet(Keypair.fromSecretKey(Uint8Array.from(secretKey)));
}

function normalizePaymentId(paymentId) {
  if (Buffer.isBuffer(paymentId)) {
    if (paymentId.length !== 32) {
      throw new Error("paymentId buffer must be exactly 32 bytes");
    }

    return paymentId;
  }

  const raw = String(paymentId || "").trim();
  if (!raw) {
    throw new Error("paymentId is required");
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length > 32) {
    return utf8.subarray(0, 32);
  }

  const padded = Buffer.alloc(32);
  utf8.copy(padded);
  return padded;
}

class SolanaService {
  constructor(options = {}) {
    this.cluster = options.cluster || DEFAULT_CLUSTER;
    this.rpcUrl = options.rpcUrl || DEFAULT_RPC_URL;
    this.commitment = options.commitment || DEFAULT_COMMITMENT;
    this.walletPath = options.walletPath || DEFAULT_WALLET_PATH;
    this.gatewayProgramId = new PublicKey(options.gatewayProgramId || DEFAULT_GATEWAY_PROGRAM_ID);
    this.oracleProgramId = new PublicKey(options.oracleProgramId || DEFAULT_ORACLE_PROGRAM_ID);
    this.tokenProgramId = new PublicKey(options.tokenProgramId || DEFAULT_TOKEN_PROGRAM_ID);
    this.connection = new Connection(this.rpcUrl, this.commitment);
    this.wallet = options.wallet || loadWalletFromFile(this.walletPath);
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: this.commitment,
      preflightCommitment: this.commitment,
    });
    this.gatewayCoder = new BorshCoder(gatewayIdl);
    this.oracleCoder = new BorshCoder(oracleIdl);
  }

  getAdminPublicKey() {
    return this.wallet.publicKey;
  }

  getGatewayConfigPda() {
    return PublicKey.findProgramAddressSync([Buffer.from("gateway_config")], this.gatewayProgramId)[0];
  }

  getOracleConfigPda() {
    return PublicKey.findProgramAddressSync([Buffer.from("oracle_config")], this.oracleProgramId)[0];
  }

  getOraclePricePda(tokenMint) {
    const mint = this.toPublicKey(tokenMint);
    return PublicKey.findProgramAddressSync([Buffer.from("price"), mint.toBuffer()], this.oracleProgramId)[0];
  }

  getProcessedPaymentPda(paymentId) {
    const normalizedPaymentId = normalizePaymentId(paymentId);
    return PublicKey.findProgramAddressSync([Buffer.from("processed_payment"), normalizedPaymentId], this.gatewayProgramId)[0];
  }

  getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = false) {
    return getAssociatedTokenAddressSync(
      this.toPublicKey(mint),
      this.toPublicKey(owner),
      allowOwnerOffCurve,
      this.tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  getGatewayVaultAddress(tokenMint) {
    return this.getAssociatedTokenAddress(tokenMint, this.getGatewayConfigPda(), true);
  }

  getMerchantTokenAccount(merchant, tokenMint) {
    return this.getAssociatedTokenAddress(tokenMint, merchant, false);
  }

  async fetchGatewayConfig() {
    const gatewayConfig = this.getGatewayConfigPda();
    const info = await this.connection.getAccountInfo(gatewayConfig, this.commitment);
    if (!info) {
      return null;
    }

    const account = this.gatewayCoder.accounts.decode("GatewayConfig", info.data);
    return {
      admin: account.admin.toBase58(),
      oracleProgram: account.oracleProgram ? account.oracleProgram.toBase58() : account.oracle_program.toBase58(),
      bump: account.bump,
      pda: gatewayConfig.toBase58(),
    };
  }

  async fetchGatewayStatus(tokenMint) {
    const gatewayConfig = await this.fetchGatewayConfig();
    const mint = tokenMint ? this.toPublicKey(tokenMint) : null;
    const gatewayVault = mint ? this.getGatewayVaultAddress(mint) : null;
    let gatewayVaultInfo = null;

    if (mint && gatewayVault) {
      gatewayVaultInfo = await this.getTokenBalance(this.getGatewayConfigPda(), mint, true);
      gatewayVaultInfo.tokenAccount = gatewayVault.toBase58();
    }

    return {
      adminWallet: this.getAdminPublicKey().toBase58(),
      gatewayProgramId: this.gatewayProgramId.toBase58(),
      gatewayConfig,
      gatewayVault: gatewayVaultInfo,
      tokenMint: mint ? mint.toBase58() : null,
    };
  }

  async fetchOracleConfig() {
    const oracleConfig = this.getOracleConfigPda();
    const info = await this.connection.getAccountInfo(oracleConfig, this.commitment);
    if (!info) {
      return null;
    }

    const account = this.oracleCoder.accounts.decode("OracleConfig", info.data);
    return {
      admin: account.admin.toBase58(),
      active: account.active,
      lastUpdated: this.bnToNumber(account.lastUpdated ?? account.last_updated),
      pda: oracleConfig.toBase58(),
    };
  }

  async fetchOraclePrice(tokenMint) {
    const oraclePrice = this.getOraclePricePda(tokenMint);
    const info = await this.connection.getAccountInfo(oraclePrice, this.commitment);
    if (!info) {
      return null;
    }

    const account = this.oracleCoder.accounts.decode("PriceAccount", info.data);
    return {
      tokenMint: (account.tokenMint ?? account.token_mint).toBase58(),
      priceArs: this.bnToNumber(account.priceArs ?? account.price_ars),
      decimals: account.decimals,
      bump: account.bump,
      pda: oraclePrice.toBase58(),
      fetchedAt: new Date(),
    };
  }

  async quoteArsToToken(amountArs, tokenMint) {
    const priceData = await this.fetchOraclePrice(tokenMint);
    if (!priceData) {
      throw new Error("No oracle price found for the provided token mint");
    }

    const normalizedAmountArs = Number(amountArs);
    if (!Number.isFinite(normalizedAmountArs) || normalizedAmountArs <= 0) {
      throw new Error("amountArs must be a positive number");
    }

    const factor = 10 ** priceData.decimals;
    const tokenAmountSmallestUnits = Math.floor((normalizedAmountArs * factor) / priceData.priceArs);
    const tokenAmount = tokenAmountSmallestUnits / factor;

    return {
      amountArs: normalizedAmountArs,
      priceArs: priceData.priceArs,
      tokenAmount,
      tokenAmountSmallestUnits,
      decimals: priceData.decimals,
      tokenMint: priceData.tokenMint,
      source: "SOLANA_ANCHOR_ORACLE",
      fetchedAt: new Date(),
    };
  }

  async getTokenBalance(owner, tokenMint, allowOwnerOffCurve = false) {
    const tokenAccount = this.getAssociatedTokenAddress(tokenMint, owner, allowOwnerOffCurve);

    try {
      const account = await getAccount(this.connection, tokenAccount, this.commitment, this.tokenProgramId);
      return {
        owner: this.toPublicKey(owner).toBase58(),
        tokenMint: this.toPublicKey(tokenMint).toBase58(),
        tokenAccount: tokenAccount.toBase58(),
        balanceSmallestUnits: account.amount.toString(),
      };
    } catch (error) {
      return {
        owner: this.toPublicKey(owner).toBase58(),
        tokenMint: this.toPublicKey(tokenMint).toBase58(),
        tokenAccount: tokenAccount.toBase58(),
        balanceSmallestUnits: "0",
        error: error.message,
      };
    }
  }

  async initializeGateway(admin = this.getAdminPublicKey()) {
    const data = this.gatewayCoder.instruction.encode("initialize", {
      admin: this.toPublicKey(admin),
      oracle_program: this.oracleProgramId,
    });

    return this.sendInstruction({
      programId: this.gatewayProgramId,
      keys: [
        { pubkey: this.getGatewayConfigPda(), isSigner: false, isWritable: true },
        { pubkey: this.getAdminPublicKey(), isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  async initializeOracle(admin = this.getAdminPublicKey()) {
    const data = this.oracleCoder.instruction.encode("initialize", {
      admin: this.toPublicKey(admin),
    });

    return this.sendInstruction({
      programId: this.oracleProgramId,
      keys: [
        { pubkey: this.getOracleConfigPda(), isSigner: false, isWritable: true },
        { pubkey: this.getAdminPublicKey(), isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  async setOraclePrice(tokenMint, humanPrice) {
    const mint = this.toPublicKey(tokenMint);
    const data = this.oracleCoder.instruction.encode("set_price", {
      human_price: new BN(humanPrice),
    });

    return this.sendInstruction({
      programId: this.oracleProgramId,
      keys: [
        { pubkey: this.getOracleConfigPda(), isSigner: false, isWritable: true },
        { pubkey: this.getAdminPublicKey(), isSigner: true, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: this.getOraclePricePda(mint), isSigner: false, isWritable: true },
        { pubkey: this.tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * El programa `pay` exige que `merchant_token_account` ya exista (ATA del mint para el merchant).
   * Si no existe, la creamos en una transacción previa (payer = admin del gateway).
   */
  async ensureMerchantTokenAccount(merchantPubkey, mintPubkey) {
    const owner = this.toPublicKey(merchantPubkey);
    const mint = this.toPublicKey(mintPubkey);
    const ata = this.getMerchantTokenAccount(owner, mint);

    const info = await this.connection.getAccountInfo(ata, this.commitment);
    if (info) {
      return { ata, created: false };
    }

    const ix = createAssociatedTokenAccountInstruction(
      this.getAdminPublicKey(),
      ata,
      owner,
      mint,
      this.tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    const signature = await this.provider.sendAndConfirm(tx, []);
    return { ata, created: true, createSignature: signature };
  }

  async executePayment({ amountArs, paymentId, merchant, tokenMint }) {
    const normalizedPaymentId = normalizePaymentId(paymentId);
    const merchantPubkey = this.toPublicKey(merchant);
    const mintPubkey = this.toPublicKey(tokenMint);
    const gatewayConfig = this.getGatewayConfigPda();
    const processedPayment = this.getProcessedPaymentPda(normalizedPaymentId);
    const oracleConfig = this.getOracleConfigPda();
    const oraclePrice = this.getOraclePricePda(mintPubkey);
    const gatewayVault = this.getGatewayVaultAddress(mintPubkey);
    const ensureAta = await this.ensureMerchantTokenAccount(merchantPubkey, mintPubkey);
    const merchantTokenAccount = ensureAta.ata;

    const data = this.gatewayCoder.instruction.encode("pay", {
      amount_ars: new BN(Math.round(Number(amountArs))),
      payment_id: Array.from(normalizedPaymentId),
    });

    const signature = await this.sendInstruction({
      programId: this.gatewayProgramId,
      keys: [
        { pubkey: gatewayConfig, isSigner: false, isWritable: true },
        { pubkey: this.getAdminPublicKey(), isSigner: true, isWritable: true },
        { pubkey: merchantPubkey, isSigner: false, isWritable: false },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: gatewayVault, isSigner: false, isWritable: true },
        { pubkey: merchantTokenAccount, isSigner: false, isWritable: true },
        { pubkey: processedPayment, isSigner: false, isWritable: true },
        { pubkey: oracleConfig, isSigner: false, isWritable: false },
        { pubkey: oraclePrice, isSigner: false, isWritable: false },
        { pubkey: this.tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return {
      success: true,
      signature,
      paymentIdHex: normalizedPaymentId.toString("hex"),
      gatewayConfig: gatewayConfig.toBase58(),
      processedPayment: processedPayment.toBase58(),
      gatewayVault: gatewayVault.toBase58(),
      merchantTokenAccount: merchantTokenAccount.toBase58(),
      merchantAtaCreated: ensureAta.created,
      merchantAtaCreateSignature: ensureAta.createSignature || null,
      merchantAtaCreateExplorerUrl: ensureAta.createSignature
        ? this.getExplorerUrl(ensureAta.createSignature)
        : null,
      explorerUrl: this.getExplorerUrl(signature),
    };
  }

  async sendInstruction({ programId, keys, data }) {
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId,
        keys,
        data,
      })
    );

    const signature = await this.provider.sendAndConfirm(tx, []);
    return signature;
  }

  getExplorerUrl(signature) {
    const clusterParam = this.cluster === "mainnet-beta" ? "" : `?cluster=${this.cluster}`;
    return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
  }

  toPublicKey(value) {
    if (value instanceof PublicKey) {
      return value;
    }

    return new PublicKey(String(value));
  }

  bnToNumber(value) {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "bigint") {
      return Number(value);
    }

    if (value && typeof value.toNumber === "function") {
      return value.toNumber();
    }

    return Number(value);
  }
}

let singleton;

function getSolanaService() {
  if (!singleton) {
    singleton = new SolanaService();
  }

  return singleton;
}

module.exports = {
  SolanaService,
  getSolanaService,
  loadWalletFromFile,
  normalizePaymentId,
};
