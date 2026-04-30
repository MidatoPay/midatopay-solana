# Sincronización CriptoYa → oracle Solana

## Qué se implementó

1. **`backend/src/services/criptoYaOracleSync.js`**  
   - Llama a `GET https://criptoya.com/api/{exchange}/{coin}/{fiat}/{volumen}` (por defecto Fiwind, USDC/ARS, volumen `0.1`).  
   - Toma el lado configurado (`CRIPTOYA_PRICE_SIDE`: `ask`, `bid` o `mid`), redondea a entero y ejecuta **`set_price`** en el programa Anchor `dynamic_fx_oracle` con la wallet admin (`SOLANA_WALLET_PATH`).

2. **`backend/src/services/priceOracle.js`**  
   - Si `CRIPTOYA_ORACLE_SYNC_ENABLED=true`, en cada tick del cron (cada 30 s) intenta sincronizar, pero **no** escribe en cadena más de una vez cada `CRIPTOYA_MIN_CHAIN_INTERVAL_MS` (por defecto 60 s), para no gastar SOL en exceso.  
   - La **primera** ejecución tras arrancar el backend sí intenta subir precio en cadena de inmediato.  
   - Tras un sync exitoso limpia la caché de precios en memoria.  
   - `getOracleStatus()` incluye `criptoYaOracleSyncEnabled: boolean`.

3. **`backend/scripts/sync-criptoya-oracle.js`** y script npm **`npm run solana:sync-criptoya`**  
   - Fuerza una sincronización manual (útil para probar sin esperar al cron).

4. **`backend/env.example`**  
   - Variables documentadas con prefijo `CRIPTOYA_*`.

## Cómo activarlo

1. Copia las variables de `env.example` a tu `backend/.env`.  
2. Asegúrate de que `SOLANA_WALLET_PATH` sea la **misma keypair admin** que posee el oracle on-chain y que tenga SOL en la red que uses.  
3. Arranca el backend: verás en consola si el sync CriptoYa está activo.  
4. Opcional: `cd backend && npm run solana:sync-criptoya` para un sync inmediato.

## Comportamiento operativo

- **Liquidación (`pay`) y cotizaciones** siguen leyendo **solo** `price_ars` on-chain.  
- Con sync activo, ese valor se **actualiza desde CriptoYa** periódicamente; deja de depender de un manual `1200` salvo que el sync falle y no hayas tocado el precio antes.

## Cómo desactivar o “volver atrás” (sin borrar archivos)

1. En `backend/.env` pon **`CRIPTOYA_ORACLE_SYNC_ENABLED=false`** o elimina la variable.  
2. Reinicia el backend.  
3. El cron solo **lee** el oracle en cadena (como antes); **no** envía más transacciones `set_price` automáticas.  
4. Si quieres fijar un precio concreto (p. ej. 1200 ARS por USDC):  
   `npm run solana:set-price -- 1200`

No hace falta cambiar el frontend ni los contratos.

## Cómo revertir del todo el cambio en el repo (eliminar lo aplicado)

Si quieres dejar el código como antes de esta feature:

1. Borra **`backend/src/services/criptoYaOracleSync.js`**.  
2. Borra **`backend/scripts/sync-criptoya-oracle.js`**.  
3. Borra **`backend/CRIPTOYA_ORACLE_SYNC.md`** (este archivo).  
4. En **`backend/package.json`**, quita el script `solana:sync-criptoya`.  
5. En **`backend/src/services/priceOracle.js`**, restaura la versión anterior (sin import de `criptoYaOracleSync`, sin `lastCriptoYaChainSyncAt`, sin bloque `updatePrices` de CriptoYa, sin `criptoYaOracleSyncEnabled` en `getOracleStatus`, sin `syncOracleFromCriptoYa` en `module.exports`).  
   - Si usás git: `git checkout -- backend/src/services/priceOracle.js` desde el commit previo.  
6. En **`backend/env.example`**, elimina el bloque de comentarios y variables `CRIPTOYA_*`.  
7. Quita las variables `CRIPTOYA_*` de tu `.env` local.

Los contratos Anchor **no** se modificaron; no hay redeploy por esta integración.

## Solución de problemas

| Síntoma | Qué revisar |
|--------|-------------|
| `NotAdmin` o firma rechazada | La wallet en `SOLANA_WALLET_PATH` debe ser el `admin` del `oracle_config`. |
| Sin SOL para fees | Recarga la wallet en devnet/testnet según corresponda. |
| HTTP error CriptoYa | Red, URL base (`CRIPTOYA_API_BASE`), o API caída; el precio on-chain queda el último bueno. |
| Precio “salta” mucho | Usa `bid`/`mid` o sube `CRIPTOYA_MIN_CHAIN_INTERVAL_MS`. |
