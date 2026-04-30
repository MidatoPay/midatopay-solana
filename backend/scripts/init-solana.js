require("dotenv").config();
const { getSolanaService } = require("../src/services/solanaService");

(async () => {
  const solana = getSolanaService();

  const oracle = await solana.fetchOracleConfig();
  if (!oracle) {
    const oracleSig = await solana.initializeOracle();
    console.log("Oracle initialized:", oracleSig, solana.getExplorerUrl(oracleSig));
  } else {
    console.log("Oracle already initialized:", oracle.pda);
  }

  const gateway = await solana.fetchGatewayConfig();
  if (!gateway) {
    const gatewaySig = await solana.initializeGateway();
    console.log("Gateway initialized:", gatewaySig, solana.getExplorerUrl(gatewaySig));
  } else {
    console.log("Gateway already initialized:", gateway.pda);
  }
})().catch((error) => {
  console.error("Solana init failed:", error);
  process.exit(1);
});
