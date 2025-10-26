'use client'
import { useState, useEffect } from 'react';
import { createWalletClient, custom, parseEther, type Address, type WalletClient } from 'viem';
import { sepolia } from 'viem/chains';
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
import { webSocketService, type WsStatus } from '../auth/lib/websocket';
import {
    generateSessionKey,
    getStoredSessionKey,
    storeSessionKey,
    storeJWT,
    removeJWT,
    type SessionKey,
} from '../auth/lib/utils';
import BackgroundTerminal from '../components/BackgroundTerminal';
import GlassNavbar from '../components/GlassNavbar';

declare global {
    interface Window {
        ethereum?: any;
    }
}

const getAuthDomain = () => ({
    name: 'DAAID',
});

const AUTH_SCOPE = 'daaid.app';
const APP_NAME = 'DAAID';
const SESSION_DURATION = 3600; // 1 hour

const CREDIT_OPTIONS = [
    { credits: 500, price: '0.005', eth: '0.005' },
    { credits: 1000, price: '0.01', eth: '0.01' },
    { credits: 10000, price: '0.1', eth: '0.1' },
];

const RECIPIENT_ADDRESS = '0xB6FFEC341d6949141d65A06891Eb028faF9ce5CD' as `0x${string}`;

export default function ShopPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedOption, setSelectedOption] = useState<typeof CREDIT_OPTIONS[0] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
    const [account, setAccount] = useState<`0x${string}` | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    
    // Authentication state
    const [wsStatus, setWsStatus] = useState<WsStatus>('Disconnected');
    const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthAttempted, setIsAuthAttempted] = useState(false);
    const [sessionExpireTimestamp, setSessionExpireTimestamp] = useState<string>('');

    // Initialize session key and WebSocket connection
    useEffect(() => {
        const existingSessionKey = getStoredSessionKey();
        if (existingSessionKey) {
            setSessionKey(existingSessionKey);
        } else {
            const newSessionKey = generateSessionKey();
            storeSessionKey(newSessionKey);
            setSessionKey(newSessionKey);
        }

        webSocketService.addStatusListener(setWsStatus);
        webSocketService.connect();

        return () => {
            webSocketService.removeStatusListener(setWsStatus);
        };
    }, []);

    // Auto-authenticate when wallet is connected
    useEffect(() => {
        if (account && sessionKey && wsStatus === 'Connected' && !isAuthenticated && !isAuthAttempted) {
            setIsAuthAttempted(true);

            const expireTimestamp = String(Math.floor(Date.now() / 1000) + SESSION_DURATION);
            setSessionExpireTimestamp(expireTimestamp);

            const authParams: AuthRequestParams = {
                address: account,
                session_key: sessionKey.address,
                app_name: APP_NAME,
                expire: expireTimestamp,
                scope: AUTH_SCOPE,
                application: account,
                allowances: [],
            };

            createAuthRequestMessage(authParams).then((payload) => {
                webSocketService.send(payload);
            });
        }
    }, [account, sessionKey, wsStatus, isAuthenticated, isAuthAttempted]);

    // Handle WebSocket messages
    useEffect(() => {
        const handleMessage = async (data: any) => {
            let response;
            try {
                response = parseAnyRPCResponse(JSON.stringify(data));
            } catch (error) {
                console.log('Ignoring RPC parsing error:', (error as Error).message);
                return;
            }

            console.log('Received WebSocket message:', response.method, response);

            if (
                response.method === RPCMethod.AuthChallenge &&
                walletClient &&
                sessionKey &&
                account &&
                sessionExpireTimestamp
            ) {
                const challengeResponse = response as AuthChallengeResponse;

                const authParams = {
                    scope: AUTH_SCOPE,
                    application: walletClient.account?.address as `0x${string}`,
                    participant: sessionKey.address as `0x${string}`,
                    expire: sessionExpireTimestamp,
                    allowances: [],
                };

                const eip712Signer = createEIP712AuthMessageSigner(walletClient as any, authParams, getAuthDomain());

                try {
                    const authVerifyPayload = await createAuthVerifyMessage(eip712Signer, challengeResponse);
                    webSocketService.send(authVerifyPayload);
                } catch (error) {
                    alert('Signature rejected. Please try again.');
                    setIsAuthAttempted(false);
                }
            }

            if (response.method === RPCMethod.AuthVerify && response.params?.success) {
                setIsAuthenticated(true);
                if (response.params.jwtToken) storeJWT(response.params.jwtToken);
            }

            // Handle errors
            if (response.method === RPCMethod.Error) {
                console.error('RPC Error:', response.params);
                removeJWT();
                alert(`Error: ${response.params.error}`);
                setIsAuthAttempted(false);
            }
        };

        webSocketService.addMessageListener(handleMessage);
        return () => webSocketService.removeMessageListener(handleMessage);
    }, [walletClient, sessionKey, sessionExpireTimestamp, account]);

    const connectWallet = async () => {
        if (!window.ethereum) {
            alert('MetaMask not found! Please install MetaMask from https://metamask.io/');
            return;
        }

        try {
            const tempClient = createWalletClient({
                chain: sepolia,
                transport: custom(window.ethereum),
            });
            const [address] = await tempClient.requestAddresses();

            if (!address) {
                alert('No wallet address found. Please ensure MetaMask is unlocked.');
                return;
            }

            const walletClient = createWalletClient({
                account: address as `0x${string}`,
                chain: sepolia,
                transport: custom(window.ethereum),
            });

            setWalletClient(walletClient);
            setAccount(address);
        } catch (error) {
            console.error('Wallet connection failed:', error);
            alert('Failed to connect wallet. Please try again.');
        }
    };

    // Server-side Nitrolite transfer function
    const createServerNitroliteTransfer = async (toAccount: string, amount: string, asset: string = 'FIG') => {
        console.log('💰 Creating server-side Nitrolite transfer...', {
            to: toAccount,
            amount,
            asset
        });

        try {
            const response = await fetch('/api/nitrolite-transfer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    toAccount,
                    amount,
                    asset
                }),
            });

            const result = await response.json();
            
            if (response.ok) {
                console.log('✅ Server transfer initiated:', result);
                return true;
            } else {
                throw new Error(result.error || 'Server transfer failed');
            }
        } catch (error) {
            console.error('❌ Error creating server transfer:', error);
            throw error;
        }
    };

    const handlePurchase = async (option: typeof CREDIT_OPTIONS[0]) => {
        setSelectedOption(option);
        setIsModalOpen(true);
        
        if (!account) {
            await connectWallet();
        }
    };

    const executePurchase = async () => {
        if (!walletClient || !selectedOption || !account) return;

        setIsProcessing(true);
        try {
            // Step 1: Send ETH transaction on Sepolia
            const txHash = await walletClient.sendTransaction({
                to: RECIPIENT_ADDRESS,
                value: parseEther(selectedOption.eth),
            } as any);

            console.log('ETH Transaction sent:', txHash);

            // Step 2: Create server-side Nitrolite transfer from server to user
            try {
                await createServerNitroliteTransfer(account, selectedOption.credits.toString(), 'FIG');
                console.log('✅ Server Nitrolite transfer initiated');
            } catch (nitroliteError) {
                console.warn('Server Nitrolite transfer failed, but continuing with claim API:', nitroliteError);
            }

            // Step 3: Call the claim API for token minting
            const response = await fetch('/api/claim', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    txHash,
                    address: account,
                }),
            });

            const result = await response.json();
            
            if (response.ok) {
                setSuccessMessage(`Added ${selectedOption.credits} credits to this wallet`);
                setShowSuccessModal(true);
                setIsModalOpen(false);
                setSelectedOption(null);
            } else {
                alert(`Purchase failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Purchase failed:', error);
            alert(`Purchase failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const closeModal = () => {
        if (!isProcessing) {
            setIsModalOpen(false);
            setSelectedOption(null);
        }
    };

    const closeSuccessModal = () => {
        setShowSuccessModal(false);
        setSuccessMessage('');
    };

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BackgroundTerminal />
            <GlassNavbar />
            
            <div style={{
                height: '70%',
                width: '80%',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '32px 40px',
                minWidth: 280,
                borderRadius: 24,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                textAlign: 'center'
            }}>
                <h1 style={{ 
                    fontSize: '2.5rem', 
                    marginBottom: '2rem', 
                    textAlign: 'center',
                    color: '#A7EF9E',
                    textShadow: '0 2px 10px rgba(167,239,158,0.25)',
                    fontWeight: 800,
                    letterSpacing: 4
                }}>
                    Credit Shop
                </h1>

                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                    gap: '1.5rem',
                    marginTop: '2rem',
                    width: '100%',
                    maxWidth: '800px'
                }}>
                    {CREDIT_OPTIONS.map((option, index) => (
                        <div key={index} style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(167,239,158,0.3)',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            textAlign: 'center',
                            backdropFilter: 'blur(10px)',
                            transition: 'all 0.3s ease',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-5px)';
                            e.currentTarget.style.borderColor = 'rgba(167,239,158,0.6)';
                            e.currentTarget.style.boxShadow = '0 10px 30px rgba(167,239,158,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.borderColor = 'rgba(167,239,158,0.3)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                        onClick={() => handlePurchase(option)}>
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: '3px',
                                background: 'linear-gradient(90deg, #A7EF9E, #00d4ff)'
                            }} />
                            
                            <h3 style={{ 
                                fontSize: '1.5rem', 
                                marginBottom: '0.5rem',
                                color: '#A7EF9E',
                                fontWeight: 700
                            }}>
                                {option.credits.toLocaleString()} Credits
                            </h3>
                            
                            <div style={{ 
                                fontSize: '1.8rem', 
                                fontWeight: 800,
                                marginBottom: '1rem',
                                color: '#A7EF9E'
                            }}>
                                {option.price} ETH
                            </div>
                            
                            <div style={{
                                background: 'rgba(167,239,158,0.1)',
                                border: '1px solid rgba(167,239,158,0.3)',
                                borderRadius: '8px',
                                padding: '0.5rem',
                                marginTop: '0.5rem'
                            }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.8, color: '#A7EF9E' }}>
                                    {index === 2 ? 'Best Value' : 'Standard'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '24px',
                        padding: '2rem',
                        maxWidth: '500px',
                        width: '90%',
                        textAlign: 'center',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
                    }}>
                        <h2 style={{ 
                            color: '#A7EF9E', 
                            marginBottom: '1rem',
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            letterSpacing: 2,
                            textShadow: '0 2px 10px rgba(167,239,158,0.25)'
                        }}>
                            Complete Purchase
                        </h2>
                        
                        {selectedOption && (
                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                                    {selectedOption.credits.toLocaleString()} Credits
                                </div>
                                <div style={{ fontSize: '1.5rem', color: '#00d4ff', fontWeight: 'bold' }}>
                                    {selectedOption.price} ETH
                                </div>
                            </div>
                        )}

                        {!account ? (
                            <button
                                onClick={connectWallet}
                                disabled={isProcessing}
                                style={{
                                    background: '#A7EF9E',
                                    border: '1px solid black',
                                    borderRadius: '9999px',
                                    padding: '10px 16px',
                                    color: 'black',
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    letterSpacing: 0.5,
                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    width: '100%',
                                    opacity: isProcessing ? 0.6 : 1,
                                    transition: 'opacity 300ms ease-in-out, background 200ms ease-in-out, border-color 200ms ease-in-out',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8
                                }}
                                onMouseEnter={(e) => {
                                    if (!isProcessing) {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isProcessing) {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                                    }
                                }}
                            >
                                Connect Wallet
                            </button>
                        ) : (
                            <div>
                                <div style={{ marginBottom: '1rem', fontSize: '0.9rem', opacity: 0.8, color: '#A7EF9E' }}>
                                    Connected: {account.slice(0, 6)}...{account.slice(-4)}
                                </div>
                                <div style={{ marginBottom: '1rem', fontSize: '0.8rem', opacity: 0.7, color: '#A7EF9E' }}>
                                    WebSocket: {wsStatus} | Auth: {isAuthenticated ? '✅' : '⏳'}
                                </div>
                            </div>
                        )}

                        {account && (
                            <button
                                onClick={executePurchase}
                                disabled={isProcessing}
                                style={{
                                    background: isProcessing ? 'rgba(167,239,158,0.3)' : '#A7EF9E',
                                    border: '1px solid black',
                                    borderRadius: '9999px',
                                    padding: '10px 16px',
                                    color: 'black',
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    letterSpacing: 0.5,
                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    width: '100%',
                                    marginTop: '1rem',
                                    transition: 'opacity 300ms ease-in-out, background 200ms ease-in-out, border-color 200ms ease-in-out',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8
                                }}
                                onMouseEnter={(e) => {
                                    if (!isProcessing) {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isProcessing) {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                                    }
                                }}
                            >
                                {isProcessing ? 'Processing...' : 'Purchase Credits'}
                            </button>
                        )}

                        <button
                            onClick={closeModal}
                            disabled={isProcessing}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(167,239,158,0.3)',
                                borderRadius: '8px',
                                padding: '0.5rem 1rem',
                                color: '#A7EF9E',
                                fontSize: '0.9rem',
                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                marginTop: '1rem',
                                opacity: isProcessing ? 0.5 : 1,
                                transition: 'all 200ms ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                                if (!isProcessing) {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,239,158,0.6)';
                                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,239,158,0.1)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isProcessing) {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,239,158,0.3)';
                                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                }
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(167,239,158,0.3)',
                        borderRadius: '24px',
                        padding: '2rem',
                        maxWidth: '500px',
                        width: '90%',
                        textAlign: 'center',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
                    }}>
                        <div style={{
                            fontSize: '3rem',
                            marginBottom: '1rem',
                            color: '#A7EF9E'
                        }}>
                            ✓
                        </div>
                        
                        <h2 style={{ 
                            color: '#A7EF9E', 
                            marginBottom: '1rem',
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            letterSpacing: 2,
                            textShadow: '0 2px 10px rgba(167,239,158,0.25)'
                        }}>
                            Success!
                        </h2>
                        
                        <p style={{
                            color: '#A7EF9E',
                            fontSize: '1.1rem',
                            marginBottom: '2rem',
                            opacity: 0.9
                        }}>
                            {successMessage}
                        </p>

                        <button
                            onClick={closeSuccessModal}
                            style={{
                                background: '#A7EF9E',
                                border: '1px solid black',
                                borderRadius: '9999px',
                                padding: '10px 16px',
                                color: 'black',
                                fontSize: '18px',
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                cursor: 'pointer',
                                width: '100%',
                                transition: 'opacity 300ms ease-in-out, background 200ms ease-in-out, border-color 200ms ease-in-out',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                            }}
                        >
                            Continue Shopping
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
