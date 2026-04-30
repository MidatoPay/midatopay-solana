use anchor_lang::{prelude::Pubkey, InstructionData, ToAccountMetas};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    signature::{read_keypair_file, Keypair, Signer},
    system_program,
    transaction::Transaction,
};
use spl_associated_token_account::{
    get_associated_token_address_with_program_id,
    instruction::create_associated_token_account,
};

const TESTNET_RPC: &str = "https://api.testnet.solana.com";
const WALLET_PATH: &str = "/home/vargaviella/.config/solana/devnet-alt.json";
const TOKEN_PROGRAM_ID: Pubkey = spl_token::ID;

fn send_tx(rpc: &RpcClient, payer: &Keypair, ix: Instruction, label: &str) -> anyhow::Result<()> {
    let blockhash = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[payer], blockhash);
    let sig = rpc.send_and_confirm_transaction(&tx)?;
    println!("{} ok: {}", label, sig);
    Ok(())
}

fn account_exists(rpc: &RpcClient, key: &Pubkey) -> bool {
    rpc.get_account(key).is_ok()
}

fn main() -> anyhow::Result<()> {
    let rpc = RpcClient::new_with_commitment(TESTNET_RPC.to_string(), CommitmentConfig::confirmed());
    let payer = read_keypair_file(WALLET_PATH)
        .map_err(|e| anyhow::anyhow!("failed reading keypair {}: {}", WALLET_PATH, e))?;
    let admin = payer.pubkey();

    println!("Admin wallet: {}", admin);
    println!("Balance: {} SOL", rpc.get_balance(&admin)? as f64 / 1_000_000_000.0);

    let test_usdc_program = test_usdc::id();
    let oracle_program = dynamic_fx_oracle::id();
    let gateway_program = payment_gateway::id();

    let (usdc_config, _) = Pubkey::find_program_address(&[b"usdc_config"], &test_usdc_program);
    let (usdc_mint, _) = Pubkey::find_program_address(&[b"usdc_mint"], &test_usdc_program);
    let user_ata = get_associated_token_address_with_program_id(&admin, &usdc_mint, &TOKEN_PROGRAM_ID);

    let (oracle_config, _) = Pubkey::find_program_address(&[b"oracle_config"], &oracle_program);
    let (price_account, _) = Pubkey::find_program_address(&[b"price", usdc_mint.as_ref()], &oracle_program);

    let (gateway_config, _) = Pubkey::find_program_address(&[b"gateway_config"], &gateway_program);
    let gateway_vault_ata =
        get_associated_token_address_with_program_id(&gateway_config, &usdc_mint, &TOKEN_PROGRAM_ID);

    println!("USDC mint PDA: {}", usdc_mint);
    println!("User ATA: {}", user_ata);
    println!("Oracle config PDA: {}", oracle_config);
    println!("Oracle price PDA: {}", price_account);
    println!("Gateway config PDA: {}", gateway_config);
    println!("Gateway vault ATA: {}", gateway_vault_ata);

    if !account_exists(&rpc, &usdc_config) {
        let accounts = test_usdc::accounts::Initialize {
            usdc_config,
            usdc_mint,
            payer: admin,
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = test_usdc::instruction::Initialize { admin }.data();
        let ix = Instruction {
            program_id: test_usdc_program,
            accounts,
            data,
        };
        send_tx(&rpc, &payer, ix, "test_usdc.initialize")?;
    } else {
        println!("test_usdc.initialize skipped (already initialized)");
    }

    if !account_exists(&rpc, &user_ata) {
        let ix = create_associated_token_account(&admin, &admin, &usdc_mint, &TOKEN_PROGRAM_ID);
        send_tx(&rpc, &payer, ix, "create ATA")?;
    } else {
        println!("ATA already exists");
    }

    let token_balance_before = rpc.get_token_account_balance(&user_ata)?;
    let current_raw: u64 = token_balance_before.amount.parse()?;
    let target_raw: u64 = 10_000 * 1_000_000;

    if current_raw < target_raw {
        let mint_amount = target_raw - current_raw;
        let accounts = test_usdc::accounts::MintToUser {
            usdc_config,
            admin,
            usdc_mint,
            destination: user_ata,
            token_program: TOKEN_PROGRAM_ID,
        }
        .to_account_metas(None);

        let data = test_usdc::instruction::MintToUser { amount: mint_amount }.data();
        let ix = Instruction {
            program_id: test_usdc_program,
            accounts,
            data,
        };
        send_tx(&rpc, &payer, ix, "test_usdc.mint_to_user(target=10_000 USDC)")?;
    } else {
        println!("mint skipped (already >= 10,000 USDC)");
    }

    let token_balance = rpc.get_token_account_balance(&user_ata)?;
    println!(
        "USDC ATA balance now: {} (raw amount: {})",
        token_balance.ui_amount_string, token_balance.amount
    );

    if !account_exists(&rpc, &gateway_vault_ata) {
        let ix =
            create_associated_token_account(&admin, &gateway_config, &usdc_mint, &TOKEN_PROGRAM_ID);
        send_tx(&rpc, &payer, ix, "create gateway vault ATA")?;
    } else {
        println!("gateway vault ATA already exists");
    }

    let gateway_balance_before = rpc.get_token_account_balance(&gateway_vault_ata)?;
    let gateway_current_raw: u64 = gateway_balance_before.amount.parse()?;
    let gateway_target_raw: u64 = 50_000 * 1_000_000;

    if gateway_current_raw < gateway_target_raw {
        let mint_amount = gateway_target_raw - gateway_current_raw;
        let accounts = test_usdc::accounts::MintToUser {
            usdc_config,
            admin,
            usdc_mint,
            destination: gateway_vault_ata,
            token_program: TOKEN_PROGRAM_ID,
        }
        .to_account_metas(None);

        let data = test_usdc::instruction::MintToUser { amount: mint_amount }.data();
        let ix = Instruction {
            program_id: test_usdc_program,
            accounts,
            data,
        };
        send_tx(&rpc, &payer, ix, "test_usdc.mint_to_user(target=50_000 to gateway vault)")?;
    } else {
        println!("gateway vault mint skipped (already >= 50,000 USDC)");
    }

    let gateway_balance = rpc.get_token_account_balance(&gateway_vault_ata)?;
    println!(
        "Gateway vault USDC now: {} (raw amount: {})",
        gateway_balance.ui_amount_string, gateway_balance.amount
    );

    if !account_exists(&rpc, &oracle_config) {
        let accounts = dynamic_fx_oracle::accounts::Initialize {
            oracle_config,
            payer: admin,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = dynamic_fx_oracle::instruction::Initialize { admin }.data();
        let ix = Instruction {
            program_id: oracle_program,
            accounts,
            data,
        };
        send_tx(&rpc, &payer, ix, "dynamic_fx_oracle.initialize")?;
    } else {
        println!("dynamic_fx_oracle.initialize skipped (already initialized)");
    }

    let accounts = dynamic_fx_oracle::accounts::SetPrice {
        oracle_config,
        admin,
        token_mint: usdc_mint,
        price_account,
        token_program: TOKEN_PROGRAM_ID,
        system_program: system_program::ID,
    }
    .to_account_metas(None);

    let data = dynamic_fx_oracle::instruction::SetPrice { human_price: 1500 }.data();
    let ix = Instruction {
        program_id: oracle_program,
        accounts,
        data,
    };
    if let Err(e) = send_tx(&rpc, &payer, ix, "dynamic_fx_oracle.set_price(1500 ARS)") {
        println!("set_price failed: {}", e);
    }

    if !account_exists(&rpc, &gateway_config) {
        let accounts = payment_gateway::accounts::Initialize {
            gateway_config,
            payer: admin,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = payment_gateway::instruction::Initialize {
            admin,
            oracle_program,
        }
        .data();

        let ix = Instruction {
            program_id: gateway_program,
            accounts,
            data,
        };
        send_tx(&rpc, &payer, ix, "payment_gateway.initialize")?;
    } else {
        println!("payment_gateway.initialize skipped (already initialized)");
    }

    let amount_ars: u64 = 150_000;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let mut payment_id = [0u8; 32];
    payment_id[..8].copy_from_slice(&now.to_le_bytes());
    payment_id[8..16].copy_from_slice(&amount_ars.to_le_bytes());
    payment_id[16..24].copy_from_slice(&admin.to_bytes()[..8]);
    payment_id[24..32].copy_from_slice(&gateway_config.to_bytes()[..8]);

    let (processed_payment, _) = Pubkey::find_program_address(
        &[b"processed_payment", payment_id.as_ref()],
        &gateway_program,
    );

    if !account_exists(&rpc, &processed_payment) {
        let accounts = payment_gateway::accounts::Pay {
            gateway_config,
            admin,
            merchant: admin,
            token_mint: usdc_mint,
            gateway_vault: gateway_vault_ata,
            merchant_token_account: user_ata,
            processed_payment,
            oracle_config,
            oracle_price: price_account,
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = payment_gateway::instruction::Pay {
            amount_ars,
            payment_id,
        }
        .data();
        let ix = Instruction {
            program_id: gateway_program,
            accounts,
            data,
        };
        send_tx(&rpc, &payer, ix, "payment_gateway.pay test")?;
    } else {
        println!("pay skipped (processed_payment already exists)");
    }

    let user_balance_after_pay = rpc.get_token_account_balance(&user_ata)?;
    let gateway_balance_after_pay = rpc.get_token_account_balance(&gateway_vault_ata)?;
    println!(
        "Post-pay balances -> merchant/user: {} USDC, gateway vault: {} USDC",
        user_balance_after_pay.ui_amount_string, gateway_balance_after_pay.ui_amount_string
    );

    println!("Done: admin set, 10k USDC minted, price set to 1500 ARS.");
    Ok(())
}
