/**
 * Ejecuta una sincronización puntual CriptoYa → oracle on-chain.
 * Requiere las mismas variables que el cron (CRIPTOYA_*, SOLANA_*).
 */
require("dotenv").config();

process.env.CRIPTOYA_ORACLE_SYNC_ENABLED = "true";

const { syncOracleFromCriptoYa } = require("../src/services/criptoYaOracleSync");

(async () => {
  const result = await syncOracleFromCriptoYa();
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) {
    process.exit(0);
  }
  if (!result.success) {
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
