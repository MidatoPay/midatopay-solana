require("dotenv").config();
const { getSolanaService } = require("../src/services/solanaService");

(async () => {
  const solana = getSolanaService();

  const oracle = await solana.fetchOracleConfig();
  if (!oracle) {
    const oracleSig = await solana.initializeOracle();
     
  } else {
     ;
  }

  const gateway = await solana.fetchGatewayConfig();
  if (!gateway) {
    const gatewaySig = await solana.initializeGateway();
     
  } else {
     ;
  }
})().catch((error) => {
  console.error("Solana init failed:", error);
  process.exit(1);
});
