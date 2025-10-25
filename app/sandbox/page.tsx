'use client'
import { useState, useEffect, useRef } from 'react';
import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';
import {
    createAuthRequestMessage,
    createAuthVerifyMessage,
    createEIP712AuthMessageSigner,
    parseAnyRPCResponse,
    RPCMethod,
    type AuthChallengeResponse,
    type AuthRequestParams,
    createECDSAMessageSigner,
    createSubmitAppStateMessage,
    parseSubmitAppStateResponse,
    createAppSessionMessage,
    parseCreateAppSessionResponse,
    type RPCAppDefinition,
    type RPCAppSessionAllocation,
    RPCProtocolVersion,
    RPCAppStateIntent,
} from '@erc7824/nitrolite';
import { webSocketService, type WsStatus } from '../auth/lib/websocket';
import {
    generateSessionKey,
    getStoredSessionKey,
    storeSessionKey,
    removeSessionKey,
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

const FIXED_PARTICIPANT_B = '0xB6FFEC341d6949141d65A06891Eb028faF9ce5CD' as `0x${string}`;

export default function SandboxPage() {
    const [account, setAccount] = useState<`0x${string}`>();
    const [walletClient, setWalletClient] = useState<WalletClient>();
    const [wsStatus, setWsStatus] = useState<WsStatus>('Disconnected');
    const [sessionKey, setSessionKey] = useState<SessionKey>();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthAttempted, setIsAuthAttempted] = useState(false);
    const [sessionExpireTimestamp, setSessionExpireTimestamp] = useState<string>('');
    
    // Request form state
    const [url, setUrl] = useState('');
    const [method, setMethod] = useState<'GET' | 'POST'>('GET');
    const [requestBody, setRequestBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [appSessionId, setAppSessionId] = useState<string>('');
    const [showSessionModal, setShowSessionModal] = useState(false);
    const [pendingRequest, setPendingRequest] = useState<any>(null);

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

    useEffect(() => {
        const handleMessage = async (data: any) => {
            const response = parseAnyRPCResponse(JSON.stringify(data));

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
                removeSessionKey();
                alert(`Error: ${response.params.error}`);
                setIsAuthAttempted(false);
            }

            try {
                const created = parseCreateAppSessionResponse(JSON.stringify(data));
                if (created?.params?.appSessionId) {
                    const newSessionId = created.params.appSessionId;
                    setAppSessionId(newSessionId);
                    console.log('App session created:', newSessionId);
                    
                    // If we have a pending request, submit it now
                    if (pendingRequest) {
                        console.log('Submitting pending request to session:', newSessionId);
                        setTimeout(() => {
                            submitAppState(newSessionId, pendingRequest);
                            setPendingRequest(null);
                        }, 100); // Small delay to ensure state is updated
                    }
                }
            } catch {}

            try {
                const submitted = parseSubmitAppStateResponse(JSON.stringify(data));
                if (submitted?.params?.appSessionId) {
                    setShowSessionModal(true);
                    setIsSubmitting(false);
                }
            } catch {}
        };

        webSocketService.addMessageListener(handleMessage);
        return () => webSocketService.removeMessageListener(handleMessage);
    }, [walletClient, sessionKey, sessionExpireTimestamp, account, pendingRequest]);

    const connectWallet = async () => {
        if (!window.ethereum) {
            alert('MetaMask not found! Please install MetaMask from https://metamask.io/');
            return;
        }

        try {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== '0x1') {
                alert('Please switch to Ethereum Mainnet in MetaMask for this workshop');
            }

            const tempClient = createWalletClient({
                chain: mainnet,
                transport: custom(window.ethereum),
            });
            const [address] = await tempClient.requestAddresses();

            if (!address) {
                alert('No wallet address found. Please ensure MetaMask is unlocked.');
                return;
            }

            const walletClient = createWalletClient({
                account: address,
                chain: mainnet,
                transport: custom(window.ethereum),
            });

            setWalletClient(walletClient);
            setAccount(address);
        } catch (error) {
            console.error('Wallet connection failed:', error);
            alert('Failed to connect wallet. Please try again.');
            return;
        }
    };

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const createAppSession = async () => {
        if (!isAuthenticated || !sessionKey || !account) {
            throw new Error('Not authenticated');
        }

        const signer = createECDSAMessageSigner(sessionKey.privateKey);
        const appDefinition: RPCAppDefinition = {
            protocol: RPCProtocolVersion.NitroRPC_0_4,
            participants: [account, FIXED_PARTICIPANT_B] as unknown as `0x${string}`[],
            weights: [100, 0],
            quorum: 100,
            challenge: 0,
            nonce: Date.now(),
        };
        const allocations: RPCAppSessionAllocation[] = [
            { participant: account as unknown as `0x${string}`, asset: 'usdc', amount: '0' },
            { participant: FIXED_PARTICIPANT_B as unknown as `0x${string}`, asset: 'usdc', amount: '0' },
        ];
        const signedMessage = await createAppSessionMessage(signer, {
            definition: appDefinition,
            allocations,
        });
        webSocketService.send(signedMessage);
    };

    const submitAppState = async (sessionId: string, requestData: any) => {
        if (!sessionKey) {
            console.error('No session key available');
            return;
        }

        try {
            console.log('Submitting app state with session:', sessionId);
            console.log('Request data:', requestData);
            const signer = createECDSAMessageSigner(sessionKey.privateKey);
            const message = await createSubmitAppStateMessage(
                signer,
                {
                    app_session_id: sessionId as `0x${string}`,
                    intent: RPCAppStateIntent.Operate,
                    version: 2,
                    allocations: [],
                    session_data: JSON.stringify(requestData),
                } as any,
            );
            
            console.log('Sending app state message:', message);
            webSocketService.send(message);
        } catch (error) {
            console.error('Failed to submit app state:', error);
            setIsSubmitting(false);
        }
    };

    const handleSubmitRequest = async () => {
        if (!isAuthenticated || !sessionKey || !account) {
            alert('Please authenticate first');
            return;
        }

        if (!url.trim()) {
            alert('Please enter a URL');
            return;
        }

        setIsSubmitting(true);

        try {
            const uuid = generateUUID();
            const requestPayload = {
                uuid,
                url: url.trim(),
                method,
                headers: {
                    "User-Agent": ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"],
                    "Accept": ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"],
                    "Content-Type": method === 'POST' ? ["application/json"] : ["text/html"]
                },
                raw_body: {
                    is_base64: false,
                    data: method === 'POST' ? requestBody : ""
                }
            };

            // If we have a session, submit directly. Otherwise, create session first
            if (appSessionId) {
                console.log('Using existing session:', appSessionId);
                await submitAppState(appSessionId, requestPayload);
            } else {
                console.log('Creating new app session...');
                console.log('Setting pending request:', requestPayload);
                setPendingRequest(requestPayload);
                await createAppSession();
            }
        } catch (error) {
            console.error('Failed to submit request:', error);
            alert('Failed to submit request. Please try again.');
            setIsSubmitting(false);
        }
    };

    const formatAddress = (address: Address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BackgroundTerminal />
            <GlassNavbar />
            
            <div style={{
                height: '80%',
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
                    Request Sandbox
                </h1>

                {!isAuthenticated ? (
                    <div>
                        <p style={{ 
                            color: '#A7EF9E', 
                            marginBottom: '2rem',
                            fontSize: '1.1rem',
                            opacity: 0.9
                        }}>
                            Authenticate to start testing requests
                        </p>
                        <button
                            onClick={connectWallet}
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
                            Authenticate
                        </button>
                    </div>
                ) : (
                    <div style={{ width: '100%', maxWidth: '600px' }}>
                        <div style={{ marginBottom: '1rem', fontSize: '0.9rem', opacity: 0.8, color: '#A7EF9E' }}>
                            Connected: {account ? formatAddress(account) : ''}
                        </div>

                        {/* URL Input */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <input
                                type="url"
                                placeholder="Enter URL (e.g., https://api.example.com/endpoint)"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(167,239,158,0.3)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: '#A7EF9E',
                                    fontSize: '16px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Method Switcher */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            marginBottom: '1.5rem',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={() => setMethod('GET')}
                                style={{
                                    background: method === 'GET' ? '#A7EF9E' : 'transparent',
                                    color: method === 'GET' ? 'black' : '#A7EF9E',
                                    border: '1px solid rgba(167,239,158,0.3)',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    transition: 'all 200ms ease-in-out'
                                }}
                            >
                                GET
                            </button>
                            <button
                                onClick={() => setMethod('POST')}
                                style={{
                                    background: method === 'POST' ? '#A7EF9E' : 'transparent',
                                    color: method === 'POST' ? 'black' : '#A7EF9E',
                                    border: '1px solid rgba(167,239,158,0.3)',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    transition: 'all 200ms ease-in-out'
                                }}
                            >
                                POST
                            </button>
                        </div>

                        {/* Request Body (only for POST) */}
                        {method === 'POST' && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <textarea
                                    placeholder="Request body (JSON)"
                                    value={requestBody}
                                    onChange={(e) => setRequestBody(e.target.value)}
                                    rows={4}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(167,239,158,0.3)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#A7EF9E',
                                        fontSize: '16px',
                                        outline: 'none',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmitRequest}
                            disabled={isSubmitting || !url.trim()}
                            style={{
                                background: isSubmitting ? 'rgba(167,239,158,0.3)' : '#A7EF9E',
                                border: '1px solid black',
                                borderRadius: '9999px',
                                padding: '10px 16px',
                                color: 'black',
                                fontSize: '18px',
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                width: '100%',
                                transition: 'opacity 300ms ease-in-out, background 200ms ease-in-out, border-color 200ms ease-in-out',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8
                            }}
                            onMouseEnter={(e) => {
                                if (!isSubmitting) {
                                    (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSubmitting) {
                                    (e.currentTarget as HTMLButtonElement).style.background = '#A7EF9E';
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'black';
                                }
                            }}
                        >
                            {isSubmitting ? 'Submitting...' : 'Test Circuit'}
                        </button>
                    </div>
                )}
            </div>

            {/* Success Modal */}
            {showSessionModal && (
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
                            Request Submitted!
                        </h2>
                        
                        <p style={{
                            color: '#A7EF9E',
                            fontSize: '1.1rem',
                            marginBottom: '2rem',
                            opacity: 0.9
                        }}>
                            Your request has been submitted to the circuit successfully.
                        </p>

                        <button
                            onClick={() => setShowSessionModal(false)}
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
                            Continue Testing
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
