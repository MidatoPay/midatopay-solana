require("dotenv").config();
const { getSolanaService } = require("../src/services/solanaService");

const priceArs = Number(process.argv[2]);
const tokenMint = process.argv[3] || process.env.SOLANA_USDC_MINT;

if (!Number.isFinite(priceArs) || priceArs <= 0) {
  console.error("Usage: node scripts/set-oracle-price.js <priceArs> [tokenMint]");
  process.exit(1);
}

if (!tokenMint) {
  console.error("Missing token mint. Provide it as second arg or SOLANA_USDC_MINT in .env");
  process.exit(1);
}

(async () => {
  const solana = getSolanaService();
  const signature = await solana.setOraclePrice(tokenMint, priceArs);
   
})().catch((error) => {
  console.error("Setting oracle price failed:", error);
  process.exit(1);
});
