import { NextRequest, NextResponse } from 'next/server';

// Disable optional dependencies that might cause bufferUtil.mask issues
process.env.WS_NO_BUFFER_UTIL = '1';
process.env.WS_NO_UTF_8_VALIDATE = '1';
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
    createAuthRequestMessage,
    createAuthVerifyMessage,
    createEIP712AuthMessageSigner,
    parseAnyRPCResponse,
    RPCMethod,
    type AuthChallengeResponse,
    type AuthRequestParams,
    createECDSAMessageSigner,
    createTransferMessage,
    type TransferRequestParams,
} from '@erc7824/nitrolite';
// Use ws package with proper error handling
const WebSocket = require('ws');

const getAuthDomain = () => ({
    name: 'DAAID',
});

const AUTH_SCOPE = 'daaid.app';
const APP_NAME = 'DAAID';
const SESSION_DURATION = 3600; // 1 hour

// Server wallet configuration
const SERVER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const NITROLITE_WS_URL = process.env.NEXT_PUBLIC_NITROLITE_WS_URL;

console.log('🔧 Server configuration check:');
console.log('SERVER_PRIVATE_KEY exists:', !!SERVER_PRIVATE_KEY);
console.log('NITROLITE_WS_URL exists:', !!NITROLITE_WS_URL);
console.log('NITROLITE_WS_URL value:', NITROLITE_WS_URL);

if (!SERVER_PRIVATE_KEY) {
    console.error('❌ SERVER_PRIVATE_KEY environment variable is required');
    throw new Error('SERVER_PRIVATE_KEY environment variable is required');
}

if (!NITROLITE_WS_URL) {
    console.error('❌ NEXT_PUBLIC_NITROLITE_WS_URL environment variable is required');
    throw new Error('NEXT_PUBLIC_NITROLITE_WS_URL environment variable is required');
}

// Create server wallet client
console.log('🔑 Creating server account from private key...');
const serverAccount = privateKeyToAccount(SERVER_PRIVATE_KEY as `0x${string}`);
console.log('✅ Server account created:', serverAccount.address);

console.log('🔗 Creating server wallet client...');
const serverWalletClient = createWalletClient({
    account: serverAccount,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org'),
});
console.log('✅ Server wallet client created');

// Generate server session key
const generateServerSessionKey = () => {
    console.log('🎲 Generating server session key...');
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    console.log('✅ Server session key generated:', account.address);
    return { privateKey, address: account.address };
};

const serverSessionKey = generateServerSessionKey();

// WebSocket connection for server
let serverWs: WebSocket | null = null;
let isServerAuthenticated = false;
let authPromise: Promise<void> | null = null;

const connectServerWebSocket = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        console.log('🔌 Attempting to connect server WebSocket...');
        console.log('WebSocket URL:', NITROLITE_WS_URL);
        
        if (serverWs && serverWs.readyState === WebSocket.OPEN) {
            console.log('✅ Server WebSocket already connected');
            resolve();
            return;
        }

        console.log('Creating new WebSocket connection...');
        try {
            // Create WebSocket with options that avoid bufferUtil issues
            serverWs = new WebSocket(NITROLITE_WS_URL, {
                perMessageDeflate: false,
                handshakeTimeout: 30000,
                // These options help avoid bufferUtil.mask issues
                skipUTF8Validation: true,
                maxPayload: 100 * 1024 * 1024, // 100MB
            });
        } catch (error) {
            console.error('❌ Failed to create WebSocket:', error);
            console.error('Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined
            });
            reject(new Error(`WebSocket creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
            return;
        }

        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
            console.error('❌ WebSocket connection timeout');
            reject(new Error('WebSocket connection timeout'));
        }, 30000);

        (serverWs as any).on('open', async () => {
            console.log('✅ Server WebSocket connected successfully');
            clearTimeout(connectionTimeout);
            
            // Start authentication process
            const expireTimestamp = String(Math.floor(Date.now() / 1000) + SESSION_DURATION);
            console.log('Auth expire timestamp:', expireTimestamp);
            
            const authParams: AuthRequestParams = {
                address: serverAccount.address,
                session_key: serverSessionKey.address,
                app_name: APP_NAME,
                expire: expireTimestamp,
                scope: AUTH_SCOPE,
                application: serverAccount.address,
                allowances: [],
            };

            console.log('Auth params:', {
                address: authParams.address,
                session_key: authParams.session_key,
                app_name: authParams.app_name,
                expire: authParams.expire,
                scope: authParams.scope,
                application: authParams.application
            });

            try {
                console.log('Creating auth request message...');
                const authMessage = await createAuthRequestMessage(authParams);
                console.log('Auth message created, sending...');
                (serverWs as any).send(authMessage);
                console.log('✅ Auth request message sent');
            } catch (error) {
                console.error('❌ Failed to create auth message:', error);
                reject(error);
            }
        });

        (serverWs as any).on('message', async (raw: any) => {
            try {
                const asString = typeof raw === 'string' ? raw : raw.toString();
                console.log('📨 Server received WebSocket message (raw):', asString);
                
                let data: unknown;
                try {
                    data = JSON.parse(asString);
                } catch (_e) {
                    console.log('Non-JSON message received, ignoring');
                    return;
                }
                
                const response = parseAnyRPCResponse(JSON.stringify(data));
                console.log('📨 Server received WebSocket message (parsed):', {
                    method: response.method,
                    params: response.params
                });

                if (response.method === RPCMethod.AuthChallenge) {
                    console.log('🔐 Received auth challenge, creating verify message...');
                    const challengeResponse = response as AuthChallengeResponse;
                    console.log('Challenge response:', challengeResponse);
                    
                    const authParams = {
                        scope: AUTH_SCOPE,
                        application: serverAccount.address,
                        participant: serverSessionKey.address,
                        expire: String(Math.floor(Date.now() / 1000) + SESSION_DURATION),
                        allowances: [],
                    };

                    console.log('Auth verify params:', authParams);

                    try {
                        console.log('Creating EIP712 signer...');
                        const eip712Signer = createEIP712AuthMessageSigner(serverWalletClient as any, authParams, getAuthDomain());
                        console.log('EIP712 signer created, creating verify message...');
                        const authVerifyPayload = await createAuthVerifyMessage(eip712Signer, challengeResponse);
                        console.log('Auth verify message created, sending...');
                        (serverWs as any).send(authVerifyPayload);
                        console.log('✅ Auth verify message sent');
                    } catch (error) {
                        console.error('❌ Failed to create auth verify message:', error);
                        reject(error);
                    }
                }

                if (response.method === RPCMethod.AuthVerify && response.params?.success) {
                    console.log('✅ Server authenticated successfully!');
                    console.log('Auth verify response:', response.params);
                    isServerAuthenticated = true;
                    resolve();
                }

                if (response.method === RPCMethod.Error) {
                    console.error('❌ Server auth error:', response.params);
                    reject(new Error(response.params.error));
                }
            } catch (error) {
                console.error('❌ Failed to parse server WebSocket message:', error);
                console.error('Raw data:', typeof raw === 'string' ? raw : raw.toString());
            }
        });

        (serverWs as any).on('error', (error: Error) => {
            console.error('❌ Server WebSocket error:', error);
            clearTimeout(connectionTimeout);
            reject(error);
        });

        (serverWs as any).on('close', (code: number, reason: Buffer) => {
            console.log('🔌 Server WebSocket closed:', { code, reason: reason.toString() });
            isServerAuthenticated = false;
        });
    });
};

const ensureServerAuthenticated = async (): Promise<void> => {
    console.log('🔐 Ensuring server authentication...');
    console.log('Current auth status:', isServerAuthenticated);
    
    if (isServerAuthenticated) {
        console.log('✅ Server already authenticated');
        return;
    }

    if (authPromise) {
        console.log('⏳ Auth already in progress, waiting...');
        return authPromise;
    }

    console.log('🚀 Starting server authentication...');
    authPromise = connectServerWebSocket();
    return authPromise;
};

const createServerTransfer = async (toAccount: string, amount: string, asset: string = 'FIG'): Promise<void> => {
    console.log('💰 Starting server transfer process...');
    console.log('Transfer details:', { toAccount, amount, asset });
    
    await ensureServerAuthenticated();

    if (!isServerAuthenticated) {
        console.error('❌ Server not authenticated with yellow node');
        throw new Error('Server not authenticated with yellow node');
    }

    console.log('✅ Server authenticated, creating transfer...');
    console.log('Transfer details:', {
        from: serverAccount.address,
        to: toAccount,
        amount,
        asset
    });

    const transferParams: TransferRequestParams = {
        destination: toAccount as `0x${string}`,
        allocations: [
            {
                asset: asset,
                amount: amount,
            }
        ],
    };

    console.log('Transfer params:', transferParams);

    try {
        console.log('Creating ECDSA signer with session key...');
        const signer = createECDSAMessageSigner(serverSessionKey.privateKey);
        console.log('ECDSA signer created, creating transfer message...');
        const transferMessage = await createTransferMessage(signer, transferParams);
        console.log('✅ Transfer message created:', transferMessage);
        
        if (serverWs && (serverWs as any).readyState === WebSocket.OPEN) {
            console.log('WebSocket is open, sending transfer message...');
            (serverWs as any).send(transferMessage);
            console.log('✅ Server transfer message sent successfully');
        } else {
            console.error('❌ Server WebSocket not connected, state:', (serverWs as any)?.readyState);
            throw new Error('Server WebSocket not connected');
        }
    } catch (error) {
        console.error('❌ Failed to create server transfer:', error);
        throw error;
    }
};

export async function POST(request: NextRequest) {
    console.log('🚀 POST /api/nitrolite-transfer - Starting request processing');
    
    try {
        console.log('📥 Parsing request body...');
        const { toAccount, amount, asset = 'FIG' } = await request.json();
        console.log('📥 Request body parsed:', { toAccount, amount, asset });

        if (!toAccount || !amount) {
            console.error('❌ Missing required fields:', { toAccount: !!toAccount, amount: !!amount });
            return NextResponse.json(
                { error: 'toAccount and amount are required' },
                { status: 400 }
            );
        }

        // Validate address format
        if (!toAccount.startsWith('0x') || toAccount.length !== 42) {
            console.error('❌ Invalid address format:', toAccount);
            return NextResponse.json(
                { error: 'Invalid toAccount address format' },
                { status: 400 }
            );
        }

        // Validate amount
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            console.error('❌ Invalid amount:', amount);
            return NextResponse.json(
                { error: 'Amount must be a positive number' },
                { status: 400 }
            );
        }

        console.log('✅ Request validation passed');
        console.log('🔄 Processing server transfer request:', { toAccount, amount, asset });

        // Create the transfer
        console.log('📤 Calling createServerTransfer...');
        await createServerTransfer(toAccount, amount, asset);
        console.log('✅ createServerTransfer completed successfully');

        const response = {
            success: true,
            message: `Transfer initiated from server to ${toAccount}`,
            from: serverAccount.address,
            to: toAccount,
            amount,
            asset
        };

        console.log('✅ Returning success response:', response);
        return NextResponse.json(response);

    } catch (error) {
        console.error('❌ Server transfer API error:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error message:', errorMessage);
        
        return NextResponse.json(
            { error: `Failed to process transfer: ${errorMessage}` },
            { status: 500 }
        );
    }
}
