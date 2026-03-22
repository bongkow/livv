/*
 * @Module: fetchUsdcBalance
 * @Purpose: Fetch USDC balance on Base network for a given Ethereum address
 * @Logic: Uses ethers v6 JsonRpcProvider pointed at Base mainnet public RPC.
 *         Calls balanceOf(address) on the USDC contract and returns formatted string.
 * @Interfaces: fetchUsdcBalance(address) → Promise<string>
 * @Constraints: Requires ethers v6. Uses public RPC — may be rate-limited.
 */

import { JsonRpcProvider, Contract } from "ethers";

const BASE_RPC_URL = "https://mainnet.base.org";
const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

// Minimal ERC-20 ABI — only balanceOf
const ERC20_BALANCE_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
];

/**
 * Fetch the USDC balance on Base for the given wallet address.
 * Returns a human-readable string like "1,234.56".
 */
export async function fetchUsdcBalance(walletAddress: string): Promise<string> {
    try {
        const provider = new JsonRpcProvider(BASE_RPC_URL);
        const contract = new Contract(USDC_BASE_ADDRESS, ERC20_BALANCE_ABI, provider);

        const rawBalance: bigint = await contract.balanceOf(walletAddress);
        const formatted = Number(rawBalance) / 10 ** USDC_DECIMALS;

        return formatted.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch (err) {
        console.error("[fetchUsdcBalance] Failed:", err);
        return "—";
    }
}
