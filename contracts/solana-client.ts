import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

// Importar los IDLs generados tras el 'anchor build'
import gatewayIdl from "../../contracts/target/idl/payment_gateway.json";
import oracleIdl from "../../contracts/target/idl/dynamic_fx_oracle.json";

export const GATEWAY_PROGRAM_ID = new PublicKey("DpVyTLLtthqVWsiGjoz3hWnvF8ugHTqhRsB1SY9Rp5zu");
export const ORACLE_PROGRAM_ID = new PublicKey("BwaGWVKhAQEUNENoXdnPDeciT4ct97s3u5mRjE4iJMkP");

export class MidatoSolanaClient {
    provider: anchor.AnchorProvider;
    gatewayProgram: Program;
    oracleProgram: Program;

    constructor(connection: Connection, wallet: anchor.Wallet) {
        this.provider = new anchor.AnchorProvider(connection, wallet, {
            preflightCommitment: "confirmed",
        });
        
        this.gatewayProgram = new Program(gatewayIdl as Idl, this.provider);
        this.oracleProgram = new Program(oracleIdl as Idl, this.provider);
    }

    // 1. Encontrar la PDA de configuración del Gateway
    async getGatewayConfigPda() {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("gateway_config")],
            GATEWAY_PROGRAM_ID
        );
        return pda;
    }

    // 2. Encontrar la PDA de un pago procesado (para evitar duplicados)
    async getProcessedPaymentPda(paymentId: Buffer) {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("processed_payment"), paymentId],
            GATEWAY_PROGRAM_ID
        );
        return pda;
    }

    /**
     * Ejecuta un pago procesando ARS -> Token
     * @param amountArs Monto en pesos argentinos (u64)
     * @param paymentId Buffer de 32 bytes identificador único
     * @param merchant Publickey del comercio
     * @param tokenMint Publickey del token (ej. USDC)
     */
    async executePayment(
        amountArs: anchor.BN,
        paymentId: Buffer,
        merchant: PublicKey,
        tokenMint: PublicKey
    ) {
        const gatewayConfig = await this.getGatewayConfigPda();
        const processedPayment = await this.getProcessedPaymentPda(paymentId);

        // En Solana las cuentas de Token se manejan como Associated Token Accounts (ATA)
        const gatewayVault = await getAssociatedTokenAddress(tokenMint, gatewayConfig, true);
        const merchantTokenAccount = await getAssociatedTokenAddress(tokenMint, merchant);

        // PDAs del Oráculo (asumiendo semillas estándar del contrato oracle)
        const [oracleConfig] = PublicKey.findProgramAddressSync(
            [Buffer.from("oracle_config")],
            ORACLE_PROGRAM_ID
        );
        const [oraclePrice] = PublicKey.findProgramAddressSync(
            [Buffer.from("price"), tokenMint.toBuffer()],
            ORACLE_PROGRAM_ID
        );

        try {
            const tx = await this.gatewayProgram.methods
                .pay(amountArs, Array.from(paymentId))
                .accounts({
                    gatewayConfig,
                    admin: this.provider.wallet.publicKey,
                    merchant,
                    tokenMint,
                    gatewayVault,
                    merchantTokenAccount,
                    processedPayment,
                    oracleConfig,
                    oraclePrice,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            
            return tx;
        } catch (error) {
            console.error("Error ejecutando pago en Solana:", error);
            throw error;
        }
    }
}
