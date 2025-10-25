import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ERC20 ABI for minting function
const ERC20_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

const RECIPIENT_ADDRESS = '0xB6FFEC341d6949141d65A06891Eb028faF9ce5CD' as `0x${string}`;

// Credit amounts based on ETH sent
const CREDIT_MAPPING = {
    '0.005': 500,
    '0.01': 1000,
    '0.1': 10000,
} as const;

export async function POST(request: NextRequest) {
    try {
        const { txHash, address } = await request.json();

        if (!txHash || !address) {
            return NextResponse.json(
                { error: 'Transaction hash and address are required' },
                { status: 400 }
            );
        }

        // Get environment variables
        const privateKey = process.env.PRIVATE_KEY;
        const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS;
        const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';

        if (!privateKey || !tokenContractAddress) {
            return NextResponse.json(
                { error: 'Server configuration missing' },
                { status: 500 }
            );
        }

        // Create public client for reading transactions
        const publicClient = createPublicClient({
            chain: sepolia,
            transport: http(rpcUrl, {
                timeout: 30000, // 30 second timeout
                retryCount: 3,
            }),
        });

        // Create wallet client for minting
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        const walletClient = createWalletClient({
            account,
            chain: sepolia,
            transport: http(rpcUrl, {
                timeout: 30000, // 30 second timeout
                retryCount: 3,
            }),
        });

        // Get transaction details
        const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
        
        if (!tx) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            );
        }

        // Verify transaction details
        if (tx.to?.toLowerCase() !== RECIPIENT_ADDRESS.toLowerCase()) {
            return NextResponse.json(
                { error: 'Invalid recipient address' },
                { status: 400 }
            );
        }

        if (tx.from.toLowerCase() !== address.toLowerCase()) {
            return NextResponse.json(
                { error: 'Transaction sender does not match provided address' },
                { status: 400 }
            );
        }

        // Determine credit amount based on ETH sent
        const txValue = tx.value;
        const ethValue = Number(txValue) / 1e18; // Convert wei to ETH
        
        let creditAmount: number;
        
        if (Math.abs(ethValue - 0.005) < 0.0001) {
            creditAmount = CREDIT_MAPPING['0.005'];
        } else if (Math.abs(ethValue - 0.01) < 0.0001) {
            creditAmount = CREDIT_MAPPING['0.01'];
        } else if (Math.abs(ethValue - 0.1) < 0.0001) {
            creditAmount = CREDIT_MAPPING['0.1'];
        } else {
            return NextResponse.json(
                { error: `Invalid payment amount. Received: ${ethValue} ETH (${txValue.toString()} wei), expected: 0.005, 0.01, or 0.1 ETH` },
                { status: 400 }
            );
        }

        // Mint tokens to the user (convert to proper token units)
        const tokenAmount = BigInt(creditAmount) * BigInt(10 ** 18); // Assuming 18 decimals
        const mintTx = await walletClient.writeContract({
            address: tokenContractAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'mint',
            args: [address as `0x${string}`, tokenAmount],
        });

        // Wait for mint transaction to be mined
        await publicClient.waitForTransactionReceipt({ hash: mintTx });

        return NextResponse.json({
            success: true,
            credits: creditAmount,
            mintTxHash: mintTx,
            message: `Successfully minted ${creditAmount} credits to ${address}`
        });

    } catch (error) {
        console.error('Claim API error:', error);
        return NextResponse.json(
            { error: 'Failed to process claim' },
            { status: 500 }
        );
    }
}
