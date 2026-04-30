# MidatoPay — Adaptación del backend a Solana (Anchor)

Documento de contexto y operación: qué se adaptó, cómo se validó, problemas que aparecieron al integrar WSL/Docker/Prisma, y el estado **actual** del stack (backend + on-chain + notas de frontend).

---

## Objetivo

La base EVM histórica fue sustituida por los programas **Anchor** en Rust del repo:

- `contracts/programs/dynamic_fx_oracle/src/lib.rs` — oráculo de tipo de cambio (ARS por token)
- `contracts/programs/payment_gateway/src/lib.rs` — cobro / `pay` hacia el merchant
- IDLs generados: `contracts/target/idl/*.json` (consumidos desde Node con `@coral-xyz/anchor`)

---

## Arquitectura resumida (backend)

- **`backend/src/services/solanaService.js`**  
  Capa única Solana/Anchor: RPC, wallet admin (`SOLANA_WALLET_PATH`), PDAs, lectura de cuentas con `BorshCoder`, envío de instrucciones (`initialize`, `set_price`, `pay`, etc.).
- **`backend/src/services/priceOracle.js`** + **`backend/src/routes/oracle.js`**  
  Precio y estado leyendo `price_account` / `oracle_config` on-chain.
- **`backend/src/services/midatopayService.js`** + **`backend/src/routes/midatopay.js`**  
  Flujo de pagos contra `payment_gateway`, cotización vía oráculo, persistencia Prisma con firma Solana real.
- **`backend/src/services/walletService.js`**  
  Wallets de usuario: **Solana** (`Keypair`), `walletAddress` en base58, secret key cifrada.

Scripts de operación:

- `backend/scripts/check-solana-status.js`
- `backend/scripts/init-solana.js`
- `backend/scripts/set-oracle-price.js`

Comandos npm (ver caveats de WSL más abajo):

- `npm run solana:status` → `node scripts/check-solana-status.js`
- `npm run solana:init` → `node scripts/init-solana.js`
- `npm run solana:set-price -- <priceArs> [mint]` → `node scripts/set-oracle-price.js`

---

## Variables de entorno relevantes (`.env`)

Valores típicos (ajustar al deployment):

| Variable | Rol |
|----------|-----|
| `SOLANA_CLUSTER` | p. ej. `testnet` |
| `SOLANA_RPC_URL` | RPC (p. ej. `https://api.testnet.solana.com`) |
| `SOLANA_COMMITMENT` | p. ej. `confirmed` |
| `SOLANA_WALLET_PATH` | Keypair del **admin** que firma `initialize` / `set_price` / `pay` |
| `SOLANA_PAYMENT_GATEWAY_PROGRAM_ID` | Program id del gateway (o el del IDL) |
| `SOLANA_ORACLE_PROGRAM_ID` | Program id del oráculo |
| `SOLANA_USDC_MINT` | Mint SPL **real** del token de liquidación (test: token propio; no usar cuentas que no sean mint) |
| `SOLANA_TOKEN_PROGRAM_ID` | `Tokenkeg...` (SPL clásico) o `Tokenz...` (Token-2022), debe coincidir con el **owner** del mint |
| `DATABASE_URL` | Postgres para Prisma |
| `WALLET_ENCRYPTION_KEY` | Clave para cifrar secret keys en BD |

**Nota:** `backend/env.example` puede quedar desfasado respecto al `docker-compose.yml` del repo (puerto/credenciales de Postgres). En desarrollo local lo habitual es alinear `DATABASE_URL` con el contenedor (`127.0.0.1:5432`, usuario `midatopay`, etc.).

---

## Corrección importante: nombre de instrucción y args (IDL)

El IDL del oráculo expone la instrucción como **`set_price`** con argumento **`human_price`** (snake_case), no `setPrice` / `humanPrice`.

Se corrigió en:

- `backend/src/services/solanaService.js` — `oracleCoder.instruction.encode("set_price", { human_price: ... })`

Sin esto, `set-oracle-price` fallaba con `Unknown method`.

---

## On-chain: problemas y resolución (sesión de integración)

### 1) Mint inválido en `SOLANA_USDC_MINT`

Síntoma: al ejecutar `set_price`, Anchor devolvía `AccountOwnedByWrongProgram` sobre `token_mint`.

Causa: la pubkey configurada **no era una cuenta mint** del token program esperado (ej. owner `BPFLoader...` en lugar de `Tokenkeg...` / `Tokenz...`).

**Acción:** crear o elegir un **mint SPL real**, verificar owner con `solana account <MINT>`, y actualizar `.env`:

- `SOLANA_USDC_MINT=<mint>`
- `SOLANA_TOKEN_PROGRAM_ID=<owner_del_mint>`

### 2) `price_account` y liquidez en `gateway_vault`

Para que el flujo de cobro tenga sentido:

1. **`set_price`** crea/actualiza `price_account` para ese mint.
2. La **vault** del gateway (ATA del `gateway_config` PDA) debe tener **saldo** del mismo mint para que `pay` pueda transferir al merchant.

Estado verificado en testnet (ejemplo de sesión; las cifras dependen del entorno):

- Oráculo activo, `price` cargado para el mint de prueba.
- Vault del gateway con saldo en unidades mínimas del token (no cero).

### 3) PDAs / cuentas de referencia (testnet, ejemplo)

Valores observados en una corrida (pueden variar si se redespliegan programas):

- Admin: `Fg2gk4rPeLj8HGz31h5LiZf5dsgY5tGafFbc3kUp14ZF`
- Gateway config PDA: `2Ajb1puzfL5uHWTFtb2jd5P4n9K9yKHGJdmRGwr4q1jN`
- Oracle config PDA: `D9HRNEmdnD43mqKHUmEJTQzZD1CVZ837dhvwEjmpYXTV`

El script `check-solana-status` imprime JSON con vault, mint y `price` para validar rápidamente.

---

## Base de datos, Docker y Prisma (WSL)

### Postgres con Docker Desktop + WSL

El `docker-compose.yml` en la raíz del repo levanta Postgres en **`127.0.0.1:5432`** (usuario `midatopay`, password `midatopay123`, DB `midatopay`).

Si en WSL no existía el CLI `docker`, hay que habilitar **WSL integration** en Docker Desktop hasta que `docker version` funcione **dentro** de la distro.

### Prisma: engines en Linux y versiones alineadas

Problemas vistos:

1. **Query Engine para OpenSSL 3 (Debian/Ubuntu en WSL)**  
   Solución en schema:

   - `backend/prisma/schema.prisma` — `binaryTargets = ["native", "debian-openssl-3.0.x"]`

2. **Cliente generado con Prisma 6 mientras `@prisma/client` era 5.x**  
   Síntoma: panic Rust `missing field enableTracing`.  
   Solución:

   - Fijar **`prisma` y `@prisma/client` en la misma versión** (p. ej. `5.22.0` en `backend/package.json`).
   - Regenerar siempre con el CLI **local**:

     ```bash
     /usr/bin/node node_modules/prisma/build/index.js generate
     ```

   - Los scripts npm usan ese enfoque:

     - `db:generate` → `node node_modules/prisma/build/index.js generate`
     - `db:migrate` / `db:reset` → mismo patrón con `migrate`

3. **Migraciones aplicadas al contenedor**

   ```bash
   /usr/bin/node node_modules/prisma/build/index.js migrate deploy
   ```

---

## Entorno de ejecución en WSL (Node / npm)

### Node Linux vs Node Windows

Síntomas: al correr `npm run ...` aparecía `CMD.EXE`, rutas UNC `\\wsl.localhost\...`, o `node` v24 desde Windows mientras `which node` en WSL mostraba `/usr/bin/node` v18.

**Recomendaciones:**

- Usar **Ubuntu/WSL** con Node/npm de Linux (`/usr/bin/node`).
- Evitar que el `PATH` de WSL ponga primero `/mnt/c/Program Files/nodejs`.
- Para scripts críticos, forzar:

  ```bash
  /usr/bin/node src/server.js
  /usr/bin/node scripts/check-solana-status.js
  ```

### Permiso denegado en `./node_modules/.bin/prisma`

Si el shim no es ejecutable, usar:

```bash
/usr/bin/node node_modules/prisma/build/index.js <comando>
```

---

## Frontend (cambios relacionados con Solana / UX)

Rutas tocadas en el repo:

- **`frontend/src/components/DashboardLayout.tsx`** y **`frontend/src/components/LanguageSelector.tsx`**  
  Bandera del selector de idioma: se quitó `style={{ width: 'auto', height: 'auto' }}` en `next/image`, que inflaba SVGs; tamaño fijo con clases (`h-4 w-5`) + `sizes`.

- **`frontend/src/app/dashboard/page.tsx`**  
  Evitar pantalla “vacía” al refrescar: esperar perfil (`user`), manejar error, y si no hay `walletAddress` mostrar CTA en lugar de un contenedor vacío.

- **`frontend/src/app/dashboard/billetera/page.tsx`**  
  Dejaba de reconoc wallets **Solana** (solo aceptaba longitud 42 EVM). Ahora acepta EVM (`0x…`) y direcciones **base58** Solana; textos i18n; botón que llama `POST /api/auth/create-wallet` y enlace a generar QR.

Locales: claves nuevas bajo `dashboard.walletPage` en `frontend/src/locales/*.json`.

---

## Estado actual (resumen)

| Área | Estado |
|------|--------|
| Backend Solana/Anchor | Implementado: servicio, rutas, scripts |
| IDL `set_price` | Corregido (`set_price` / `human_price`) |
| On-chain (testnet de trabajo) | Oráculo + gateway inicializables; `set_price` y vault operativos con mint SPL válido |
| Postgres + Prisma | Docker + `migrate deploy`; engines Linux + versiones Prisma alineadas |
| Frontend | Alineación básica dashboard/billetera + i18n; imágenes de idioma corregidas |

**Pendientes / deuda técnica**

- Opcional: subir `frontend` a **Node ≥ 20** para satisfacer engines de dependencias recientes.
- Cablear en UI los saldos `--` del dashboard a datos reales (oracle + SPL), si aún son placeholders.

---

## Comandos de verificación rápida

Desde `backend/` en WSL (ajustar rutas):

```bash
/usr/bin/node scripts/check-solana-status.js
/usr/bin/node scripts/set-oracle-price.js 1200
/usr/bin/node src/server.js
```

Salud HTTP:

```bash
curl -sS http://localhost:3001/health
```

---

## Referencia de archivos clave

**Backend**

- `backend/src/services/solanaService.js`
- `backend/src/services/priceOracle.js`, `backend/src/routes/oracle.js`
- `backend/src/services/midatopayService.js`, `backend/src/routes/midatopay.js`
- `backend/src/services/walletService.js`
- `backend/prisma/schema.prisma`
- `backend/package.json`
- `backend/scripts/*.js`

**Contratos**

- `contracts/programs/dynamic_fx_oracle/src/lib.rs`
- `contracts/programs/payment_gateway/src/lib.rs`
- `contracts/target/idl/*.json`

**Frontend (relacionado)**

- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/app/dashboard/billetera/page.tsx`
- `frontend/src/components/DashboardLayout.tsx`
- `frontend/src/components/LanguageSelector.tsx`
- `frontend/src/locales/*.json`
