require("dotenv").config();
const { getSolanaService } = require("../src/services/solanaService");

(async () => {
  const solana = getSolanaService();
  const gateway = await solana.fetchGatewayStatus(process.env.SOLANA_USDC_MINT);
  const oracle = await solana.fetchOracleConfig();
  const price = process.env.SOLANA_USDC_MINT
    ? await solana.fetchOraclePrice(process.env.SOLANA_USDC_MINT)
    : null;

  console.log(JSON.stringify({
    admin: solana.getAdminPublicKey().toBase58(),
    gateway,
    oracle,
    price,
  }, null, 2));
})().catch((error) => {
  console.error("Solana status check failed:", error);
  process.exit(1);
});
