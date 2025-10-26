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

function safeStringify(value: unknown) {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

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
    const [pendingRequest, setPendingRequest] = useState<any>(null);
    const [wsMessages, setWsMessages] = useState<any[]>([]);
    const [apiResponse, setApiResponse] = useState<any>(null);
    const [storedSessionId, setStoredSessionId] = useState<string>('');
    const [participantAddress, setParticipantAddress] = useState<string>('0x833464f05d2d94645e0d18c05f6e8aa06f4e97c4');
    const [customSessionId, setCustomSessionId] = useState<string>('');
    const [useCustomSession, setUseCustomSession] = useState<boolean>(false);
    const [createdSessions, setCreatedSessions] = useState<Set<string>>(new Set());
    const [sessionStatus, setSessionStatus] = useState<Map<string, string>>(new Map());

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
            let response;
            try {
                response = parseAnyRPCResponse(JSON.stringify(data));
            } catch (error) {
                // Ignore parsing errors and don't display them
                console.log('Ignoring RPC parsing error:', (error as Error).message);
                return;
            }

            // Add all messages to the display (show everything)
            console.log('Received WebSocket message:', response.method, response);
            setWsMessages(prev => [...prev, {
                timestamp: new Date().toISOString(),
                type: 'received',
                data: response,
                raw: data
            }]);

            // Check if this is a request message that needs to be executed
            if (response.method === 'submit_app_state' && response.params?.appSessionId) {
                try {
                    // Look for session data in the raw message - following the backend script pattern
                    const rawData = data;
                    console.log('Received submit_app_state message:', rawData);
                    
                    // Extract session data from the message structure
                    const sessionDataRaw = rawData?.res?.[2]?.session_data || rawData?.[1]?.[2]?.session_data;
                    let sessionData;
                    
                    if (typeof sessionDataRaw === 'string') {
                        try {
                            sessionData = JSON.parse(sessionDataRaw);
                        } catch {
                            sessionData = sessionDataRaw;
                        }
                    } else {
                        sessionData = sessionDataRaw;
                    }
                    
                    console.log('Extracted session data:', sessionData);
                    
                    // Check if this is a forwarded request (following backend script pattern)
                    if (sessionData && sessionData.uuid && sessionData.url && sessionData.method) {
                        const sessionId = response.params.appSessionId;
                        console.log('Received forwarded request via WebSocket:', sessionData);
                        console.log('Session ID:', sessionId);
                        console.log('Created sessions:', Array.from(createdSessions));
                        console.log('Is session created by this browser:', createdSessions.has(sessionId));
                        
                        // Only process requests from sessions this browser created
                        if (createdSessions.has(sessionId)) {
                            console.log('Processing request from our created session...');
                            await handleIncomingRequest(sessionData, sessionId);
                        } else {
                            console.log('Ignoring request from session we did not create');
                        }
                    }
                } catch (error) {
                    console.log('Could not parse session data:', error);
                }
            }

            // Also check for create_app_session responses to show session creation
            if (response.method === 'create_app_session' && response.params?.appSessionId) {
                console.log('App session created:', response.params.appSessionId);
                // Add a message to show session creation
                setWsMessages(prev => [...prev, {
                    timestamp: new Date().toISOString(),
                    type: 'received',
                    data: { type: 'session_created', sessionId: response.params.appSessionId },
                    raw: data
                }]);
            }

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
                    
                    // Add sent message to display
                    setWsMessages(prev => [...prev, {
                        timestamp: new Date().toISOString(),
                        type: 'sent',
                        data: { method: 'AuthVerify', payload: authVerifyPayload },
                        raw: authVerifyPayload
                    }]);
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
                        console.log('Submitting pending request to new session:', newSessionId);
                        setTimeout(async () => {
                            // Step 1: Submit the request data to the new session (version 2)
                            await submitAppState(newSessionId, pendingRequest, 2);
                            console.log('Request submitted to session:', newSessionId);
                            
                            // Step 2: Call the circuit test API
                            try {
                                console.log('Calling circuit test API...');
                                const response = await fetch('/api/circuit-test', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        url: pendingRequest.url,
                                        method: pendingRequest.method,
                                        headers: pendingRequest.headers,
                                        body: pendingRequest.method === 'POST' ? pendingRequest.raw_body.data : '',
                                    }),
                                });

                                const result = await response.json();
                                
                                // Store the API response for display
                                setApiResponse(result);
                                
                                if (response.ok) {
                                    console.log('Circuit test completed:', result);
                                    
                                    // Step 3: Submit the result as app state to the same session
                                    const resultPayload = {
                                        uuid: generateUUID(),
                                        type: 'response',
                                        timestamp: new Date().toISOString(),
                                        result: result.result
                                    };

                                    console.log('Submitting result as app state to same session:', newSessionId);
                                    await submitAppState(newSessionId, resultPayload, 3);
                                    console.log('Result submitted to session:', newSessionId);
                                } else {
                                    console.error('Circuit test failed:', result.error);
                                }
                            } catch (error) {
                                console.error('Failed to call circuit test API:', error);
                            }
                            
                            // Clear the pending request
                            setPendingRequest(null);
                        }, 100); // Small delay to ensure state is updated
                    }
                }
            } catch (error) {
                // Ignore parsing errors silently
            }

            try {
                const submitted = parseSubmitAppStateResponse(JSON.stringify(data));
                if (submitted?.params?.appSessionId) {
                    setIsSubmitting(false);
                }
            } catch (error) {
                // Ignore parsing errors silently
            }
        };

        webSocketService.addMessageListener(handleMessage);
        return () => webSocketService.removeMessageListener(handleMessage);
    }, [walletClient, sessionKey, sessionExpireTimestamp, account, pendingRequest]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        const messagesContainer = document.querySelector('[data-messages-container]');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, [wsMessages]);

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

    const createAppSession = async (participantB: string): Promise<string> => {
        if (!isAuthenticated || !sessionKey || !account) {
            throw new Error('Not authenticated');
        }

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Session creation timeout'));
            }, 10000);

            const handleSessionResponse = (data: any) => {
                try {
                    console.log('Received session response:', data);
                    const response = parseCreateAppSessionResponse(JSON.stringify(data));
                    console.log('Parsed session response:', response);
                    
                    if (response?.params?.appSessionId) {
                        console.log('Session created with ID:', response.params.appSessionId);
                        console.log('Session status:', response.params.status);
                        // Track that this browser created this session
                        setCreatedSessions(prev => new Set([...prev, response.params.appSessionId]));
                        setSessionStatus(prev => new Map([...prev, [response.params.appSessionId, response.params.status || 'created']]));
                        clearTimeout(timeout);
                        webSocketService.removeMessageListener(handleSessionResponse);
                        resolve(response.params.appSessionId);
                    }
                } catch (error) {
                    console.log('Error parsing session response:', error);
                    // Ignore parsing errors
                }
            };

            webSocketService.addMessageListener(handleSessionResponse);

            const signer = createECDSAMessageSigner(sessionKey.privateKey);
            const appDefinition: RPCAppDefinition = {
                protocol: RPCProtocolVersion.NitroRPC_0_2,
                participants: [account, participantB as `0x${string}`] as unknown as `0x${string}`[],
                weights: [100, 0], // Creator has 100% weight, participant has 0%
                quorum: 100, // Require 100% quorum
                challenge: 0,
                nonce: Date.now(),
            };
            const allocations: RPCAppSessionAllocation[] = [
                { participant: account as unknown as `0x${string}`, asset: 'usdc', amount: '0' },
                { participant: participantB as unknown as `0x${string}`, asset: 'usdc', amount: '0' },
            ];
            const signedMessage = await createAppSessionMessage(signer, {
                definition: appDefinition,
                allocations,
            });
            
            console.log('Sending create_app_session message:', signedMessage);
            webSocketService.send(signedMessage);
            
            // Add sent message to display
            setWsMessages(prev => [...prev, {
                timestamp: new Date().toISOString(),
                type: 'sent',
                data: { type: 'create_app_session', participantB: participantB },
                raw: signedMessage
            }]);
        });
    };

    const handleCreateSession = async () => {
        if (!isAuthenticated || !sessionKey || !account) {
            alert('Please authenticate first');
            return;
        }

        if (!participantAddress.trim()) {
            alert('Please enter a participant address');
            return;
        }

        // Validate address format
        if (!participantAddress.trim().startsWith('0x') || participantAddress.trim().length !== 42) {
            alert('Please enter a valid Ethereum address (0x followed by 40 characters)');
            return;
        }

        try {
            console.log('Creating new app session...');
            console.log('Participant address:', participantAddress.trim());
            const newSessionId = await createAppSession(participantAddress.trim());
            console.log('App session created with ID:', newSessionId);
            console.log('Session ID type:', typeof newSessionId);
            console.log('Session ID length:', newSessionId?.length);
            setStoredSessionId(newSessionId);
            alert(`Session created: ${newSessionId}`);
        } catch (error) {
            console.error('Failed to create session:', error);
            alert(`Failed to create session: ${(error as Error).message}`);
        }
    };

    const waitForSessionReady = async (sessionId: string, maxWaitTime: number = 5000): Promise<boolean> => {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
            const status = sessionStatus.get(sessionId);
            console.log(`Waiting for session ${sessionId} to be ready. Current status: ${status}`);
            if (status === 'open') {
                console.log(`Session ${sessionId} is ready!`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`Session ${sessionId} did not become ready within ${maxWaitTime}ms`);
        return false;
    };

    const handleIncomingRequest = async (requestData: any, sessionId: string) => {
        try {
            console.log('Executing incoming request:', requestData);
            console.log('Session ID for response:', sessionId);
            
            // Call the new WebSocket-based API
            const response = await fetch('/api/circuit-test-ws', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wsMessageData: requestData,
                    sessionId: sessionId
                }),
            });

            const result = await response.json();
            
            if (response.ok) {
                console.log('Request executed successfully:', result);
                
                // Submit the result back to the same session - following backend script pattern
                const resultPayload = {
                    uuid: requestData.uuid, // Use the original UUID from the request
                    response: result.result.response || result.result // Follow backend script structure
                };

                console.log('Submitting result back to session:', sessionId);
                console.log('Result payload:', resultPayload);
                await submitAppState(sessionId, resultPayload, 3);
                console.log('Result submitted to session:', sessionId);
            } else {
                console.error('Request execution failed:', result.error);
            }
        } catch (error) {
            console.error('Failed to execute incoming request:', error);
        }
    };

    const submitAppState = async (sessionId: string, requestData: any, version: number = 2) => {
        if (!sessionKey) {
            console.error('No session key available');
            return;
        }

        try {
            console.log(`Submitting app state with session: ${sessionId}, version: ${version}`);
            console.log('Request data:', requestData);
            const signer = createECDSAMessageSigner(sessionKey.privateKey);
            const message = await createSubmitAppStateMessage(
                signer,
                {
                    appSessionId: sessionId as `0x${string}`,
                    state: requestData,
                } as any,
            );
            
            console.log('Sending app state message:', message);
            console.log('Session ID:', sessionId);
            console.log('Request data:', requestData);
            webSocketService.send(message);
            
            // Add sent message to display
            setWsMessages(prev => [...prev, {
                timestamp: new Date().toISOString(),
                type: 'sent',
                data: { type: 'submit_app_state', sessionId: sessionId, requestData: requestData },
                raw: message
            }]);
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
        setApiResponse(null); // Clear previous response

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

            let sessionIdToUse = useCustomSession ? customSessionId : storedSessionId;
            
            // If no session available, create a new one
            if (!sessionIdToUse) {
                console.log('No session found, creating new app session...');
                sessionIdToUse = await createAppSession(participantAddress.trim());
                console.log('App session created:', sessionIdToUse);
                setStoredSessionId(sessionIdToUse);
            } else {
                console.log('Using session:', sessionIdToUse);
            }

            console.log('Submitting app state with session:', sessionIdToUse);
            console.log('Session ID validation - is participant address:', sessionIdToUse === participantAddress.trim());
            console.log('Session ID validation - length:', sessionIdToUse?.length);
            
            // Validate that we're not using a participant address as session ID
            if (sessionIdToUse === participantAddress.trim()) {
                console.error('ERROR: Using participant address as session ID!');
                alert('Error: Session ID is the same as participant address. Please create a new session.');
                return;
            }
            
            // Wait for session to be fully established and ready
            console.log('Waiting for session to be established...');
            const isReady = await waitForSessionReady(sessionIdToUse, 10000);
            
            if (!isReady) {
                console.error('Session not ready, but proceeding anyway...');
            }
            
            await submitAppState(sessionIdToUse, requestPayload, 2);
            console.log('Request submitted to session:', sessionIdToUse);

            // Store the request for later processing
            setPendingRequest({
                sessionId: sessionIdToUse,
                ...requestPayload
            });
        } catch (error) {
            console.error('Failed to submit request:', error);
            alert('Failed to submit request. Please try again.');
        } finally {
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
                    <div style={{ 
                        width: '100%', 
                        height: '100%',
                        display: 'flex',
                        gap: '2rem'
                    }}>
                        {/* Left Side - Controls */}
                        <div style={{ 
                            flex: '0 0 400px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.5rem'
                        }}>
                            <div 
                                onClick={() => {
                                    if (account) {
                                        navigator.clipboard.writeText(account);
                                        alert('Wallet address copied to clipboard!');
                                    }
                                }}
                                style={{ 
                                    fontSize: '0.9rem', 
                                    opacity: 0.8, 
                                    color: '#A7EF9E',
                                    cursor: account ? 'pointer' : 'default',
                                    background: account ? 'rgba(167,239,158,0.1)' : 'transparent',
                                    border: account ? '1px solid rgba(167,239,158,0.3)' : 'none',
                                    borderRadius: '6px',
                                    padding: '8px 12px',
                                    transition: 'all 200ms ease-in-out',
                                    userSelect: 'none'
                                }}
                                onMouseEnter={(e) => {
                                    if (account) {
                                        e.currentTarget.style.background = 'rgba(167,239,158,0.2)';
                                        e.currentTarget.style.borderColor = 'rgba(167,239,158,0.5)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (account) {
                                        e.currentTarget.style.background = 'rgba(167,239,158,0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(167,239,158,0.3)';
                                    }
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>Connected:</span>
                                    <span style={{ fontWeight: 600 }}>
                                        {account ? formatAddress(account) : 'Not connected'}
                                    </span>
                                    {account && (
                                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                            (click to copy)
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            {/* WebSocket Status */}
                            <div style={{ 
                                fontSize: '0.8rem', 
                                color: wsStatus === 'Connected' ? '#A7EF9E' : '#ff6b6b',
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid rgba(167,239,158,0.3)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                marginBottom: '1rem'
                            }}>
                                <strong>WebSocket Status:</strong> {wsStatus}
                                {wsStatus === 'Connected' && (
                                    <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '4px' }}>
                                        Ready to receive messages from other browsers
                                    </div>
                                )}
                            </div>

                            {/* Distributed Testing Info */}
                            <div style={{ 
                                fontSize: '0.7rem', 
                                color: '#A7EF9E',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(167,239,158,0.2)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                marginBottom: '1rem',
                                lineHeight: '1.4'
                            }}>
                                <strong>Distributed Testing Setup:</strong>
                                <div style={{ marginTop: '4px', fontSize: '0.6rem', opacity: 0.8 }}>
                                    1. Open two browsers with different wallets<br/>
                                    2. Set opposite participant addresses<br/>
                                    3. Create sessions on both browsers<br/>
                                    4. Submit requests from Browser A<br/>
                                    5. Browser B will execute and respond<br/>
                                    <strong>Note:</strong> Each browser only processes requests from sessions it created
                                </div>
                            </div>

                            {/* Participant Address Input */}
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem', 
                                    color: '#A7EF9E',
                                    fontWeight: 600
                                }}>
                                    Participant Address
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter participant address (e.g., 0x833464f05d2d94645e0d18c05f6e8aa06f4e97c4)"
                                    value={participantAddress}
                                    onChange={(e) => setParticipantAddress(e.target.value)}
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

                            {/* Custom Session ID Input */}
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem', 
                                    color: '#A7EF9E',
                                    fontWeight: 600
                                }}>
                                    Custom Session ID (Optional)
                                </label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={useCustomSession}
                                        onChange={(e) => setUseCustomSession(e.target.checked)}
                                        style={{ transform: 'scale(1.2)' }}
                                    />
                                    <span style={{ color: '#A7EF9E', fontSize: '14px' }}>
                                        Use custom session ID
                                    </span>
                                </div>
                                {useCustomSession && (
                                    <input
                                        type="text"
                                        placeholder="Enter custom session ID"
                                        value={customSessionId}
                                        onChange={(e) => setCustomSessionId(e.target.value)}
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
                                )}
                            </div>

                            {/* Create Session Button */}
                            <button
                                onClick={handleCreateSession}
                                disabled={!isAuthenticated || !participantAddress.trim()}
                                style={{
                                    background: (!isAuthenticated || !participantAddress.trim()) ? 'rgba(167,239,158,0.3)' : '#A7EF9E',
                                    border: '1px solid black',
                                    borderRadius: '9999px',
                                    padding: '10px 16px',
                                    color: 'black',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    cursor: (!isAuthenticated || !participantAddress.trim()) ? 'not-allowed' : 'pointer',
                                    width: '100%',
                                    transition: 'opacity 300ms ease-in-out, background 200ms ease-in-out, border-color 200ms ease-in-out',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8
                                }}
                            >
                                Create Session
                            </button>

                            {/* Debug WebSocket Button */}
                            <button
                                onClick={() => {
                                    console.log('WebSocket Status:', wsStatus);
                                    console.log('Account:', account);
                                    console.log('Session Key:', sessionKey);
                                    console.log('Is Authenticated:', isAuthenticated);
                                    console.log('Stored Session ID:', storedSessionId);
                                    console.log('Custom Session ID:', customSessionId);
                                    console.log('Use Custom Session:', useCustomSession);
                                    alert(`WebSocket Status: ${wsStatus}\nAccount: ${account}\nAuthenticated: ${isAuthenticated}`);
                                }}
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(167,239,158,0.3)',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    color: '#A7EF9E',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    width: '100%'
                                }}
                            >
                                Debug WebSocket Status
                            </button>

                            {/* Session Information Display */}
                            <div style={{ 
                                fontSize: '0.8rem', 
                                color: '#A7EF9E', 
                                opacity: 0.8,
                                background: 'rgba(167,239,158,0.1)',
                                border: '1px solid rgba(167,239,158,0.3)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                wordBreak: 'break-all'
                            }}>
                                <div style={{ marginBottom: '4px' }}>
                                    <strong>Current Session:</strong> {useCustomSession ? customSessionId || 'None' : storedSessionId || 'None'}
                                </div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                    {useCustomSession ? 'Using custom session ID' : 'Using stored session ID'}
                                </div>
                                {storedSessionId && (
                                    <div style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '4px', wordBreak: 'break-all' }}>
                                        <strong>Debug:</strong> Length: {storedSessionId.length}, 
                                        Is Participant: {storedSessionId === participantAddress.trim() ? 'YES' : 'NO'}
                                    </div>
                                )}
                                {createdSessions.size > 0 && (
                                    <div style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '4px' }}>
                                        <strong>Created Sessions:</strong> {createdSessions.size}
                                        <div style={{ fontSize: '0.5rem', marginTop: '2px', wordBreak: 'break-all' }}>
                                            {Array.from(createdSessions).map((sessionId, index) => {
                                                const status = sessionStatus.get(sessionId);
                                                return (
                                                    <div key={index} style={{ marginBottom: '2px' }}>
                                                        {sessionId.slice(0, 10)}...{sessionId.slice(-6)} 
                                                        <span style={{ color: status === 'open' ? '#A7EF9E' : '#ff6b6b' }}>
                                                            ({status || 'unknown'})
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {storedSessionId && !useCustomSession && (
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(storedSessionId);
                                            alert('Session ID copied to clipboard!');
                                        }}
                                        style={{
                                            background: 'rgba(167,239,158,0.2)',
                                            border: '1px solid rgba(167,239,158,0.5)',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            color: '#A7EF9E',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            marginTop: '4px'
                                        }}
                                    >
                                        Copy Session ID
                                    </button>
                                )}
                            </div>

                            {/* URL Input */}
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem', 
                                    color: '#A7EF9E',
                                    fontWeight: 600
                                }}>
                                    URL
                                </label>
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
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem', 
                                    color: '#A7EF9E',
                                    fontWeight: 600
                                }}>
                                    Method
                                </label>
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '8px'
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
                                            transition: 'all 200ms ease-in-out',
                                            flex: 1
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
                                            transition: 'all 200ms ease-in-out',
                                            flex: 1
                                        }}
                                    >
                                        POST
                                    </button>
                                </div>
                            </div>

                            {/* Request Body (only for POST) */}
                            {method === 'POST' && (
                                <div>
                                    <label style={{ 
                                        display: 'block', 
                                        marginBottom: '0.5rem', 
                                        color: '#A7EF9E',
                                        fontWeight: 600
                                    }}>
                                        Request Body
                                    </label>
                                    <textarea
                                        placeholder="Request body (JSON)"
                                        value={requestBody}
                                        onChange={(e) => setRequestBody(e.target.value)}
                                        rows={6}
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
                                    padding: '12px 24px',
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

                            {/* API Response Display */}
                            {apiResponse && (
                                <div style={{ marginTop: '1.5rem' }}>
                                    <label style={{ 
                                        display: 'block', 
                                        marginBottom: '0.5rem', 
                                        color: '#A7EF9E',
                                        fontWeight: 600
                                    }}>
                                        API Response
                                    </label>
                                    <div style={{
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(167,239,158,0.3)',
                                        borderRadius: '8px',
                                        padding: '1rem',
                                        fontFamily: 'monospace',
                                        fontSize: '0.9rem',
                                        color: '#A7EF9E',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        maxHeight: '300px',
                                        overflowY: 'auto'
                                    }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                            {safeStringify(apiResponse)}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Side - WebSocket Messages */}
                        <div style={{ 
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: '500px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(167,239,158,0.4)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            backdropFilter: 'blur(10px)'
                        }}>
                            <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '1rem'
                            }}>
                                <h3 style={{ 
                                    color: '#A7EF9E', 
                                    fontSize: '1.2rem',
                                    fontWeight: 700,
                                    margin: 0
                                }}>
                                    WebSocket Messages ({wsMessages.length})
                                </h3>
                                <button
                                    onClick={() => setWsMessages([])}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        border: '1px solid rgba(167,239,158,0.3)',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        color: '#A7EF9E',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                            <div 
                                data-messages-container
                                style={{ 
                                    flex: 1,
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '0.5rem',
                                    overflowY: 'auto',
                                    paddingRight: '0.5rem'
                                }}
                            >
                                {wsMessages.map((message, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            background: message.type === 'sent' 
                                                ? 'rgba(167,239,158,0.1)' 
                                                : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${message.type === 'sent' 
                                                ? 'rgba(167,239,158,0.3)' 
                                                : 'rgba(255,255,255,0.2)'}`,
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            fontSize: '0.9rem',
                                            color: '#A7EF9E'
                                        }}
                                    >
                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center',
                                            marginBottom: '0.5rem'
                                        }}>
                                            <span style={{ 
                                                fontWeight: 700,
                                                color: message.type === 'sent' ? '#A7EF9E' : '#00d4ff'
                                            }}>
                                                {message.type === 'sent' ? '→ Sent' : '← Received'}
                                            </span>
                                            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                                {new Date(message.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <div style={{ 
                                            fontFamily: 'monospace', 
                                            fontSize: '0.8rem',
                                            background: 'rgba(0,0,0,0.2)',
                                            padding: '0.5rem',
                                            borderRadius: '4px',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all'
                                        }}>
                                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{safeStringify(message.data)}</pre>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}