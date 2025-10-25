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
    createGetLedgerBalancesMessage,
    type GetLedgerBalancesResponse,
    type BalanceUpdateResponse,
    type TransferResponse,
    // App session APIs
    createAppSessionMessage,
    parseCreateAppSessionResponse,
    createCloseAppSessionMessage,
    parseCloseAppSessionResponse,
    NitroliteRPC,
    parseGetAppSessionsResponse,
    type RPCAppDefinition,
    type RPCAppSessionAllocation,
    // App state APIs
    createSubmitAppStateMessage,
    parseSubmitAppStateResponse,
    RPCProtocolVersion,
} from '@erc7824/nitrolite';
import { webSocketService, type WsStatus } from './lib/websocket';
import {
    generateSessionKey,
    getStoredSessionKey,
    storeSessionKey,
    removeSessionKey,
    storeJWT,
    removeJWT,
    type SessionKey,
} from './lib/utils';

function safeStringify(value: unknown) {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

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

const DEFAULT_WEIGHTS = [100, 0];
const DEFAULT_QUORUM = 100;

const FIXED_PARTICIPANT_B = '0xB6FFEC341d6949141d65A06891Eb028faF9ce5CD' as `0x${string}`;

export default function App() {
    const [account, setAccount] = useState<`0x${string}`>();
    const [walletClient, setWalletClient] = useState<WalletClient >();
    const [wsStatus, setWsStatus] = useState<WsStatus>('Disconnected');
    const [sessionKey, setSessionKey] = useState<SessionKey >();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthAttempted, setIsAuthAttempted] = useState(false);
    const [sessionExpireTimestamp, setSessionExpireTimestamp] = useState<string>('');
    const [, setBalances] = useState<Record<string, string> >();
    const [, setIsLoadingBalances] = useState(false);
    
    const [isTransferring, setIsTransferring] = useState(false);
    const [, setTransferStatus] = useState<string >();

    // App Session UI state
    const [amount] = useState<string>('0.00');
    const [, setCreateResult] = useState<string>('');
    const [, setGetSessionsResult] = useState<string>('');
    const [closeSessionId, setCloseSessionId] = useState<string>('');
    const [, setCloseResult] = useState<string>('');

    const [appStateValue, setAppStateValue] = useState<string>("{\"counter\":1}");
    const [, setSubmitStateResult] = useState<string>('');
    const [, setGetStateResult] = useState<string>('');

    const [, setChannelsResult] = useState<string>('');
    const [, setRpcHistoryResult] = useState<string>('');
    const [deriveStateFromHistory, setDeriveStateFromHistory] = useState<boolean>(false);

    const [showAd, setShowAd] = useState(false);
    const autoSessionEnsuredRef = useRef(false);

    useEffect(() => {
        const existingSessionKey = getStoredSessionKey();
        if (existingSessionKey) {
            setSessionKey(existingSessionKey);
        } else {
            const newSessionKey = generateSessionKey();
            storeSessionKey(newSessionKey);
            setSessionKey(newSessionKey);
        }

        try {
            const savedSessionId = localStorage.getItem('app_session_id');
            if (savedSessionId) setCloseSessionId(savedSessionId);
        } catch {}

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
        if (isAuthenticated && sessionKey && account) {
            console.log('Authenticated! Fetching ledger balances...');
            ensureOpenSessionAfterAuth();
            setIsLoadingBalances(true);

            const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);

            createGetLedgerBalancesMessage(sessionSigner, account)
                .then((getBalancesPayload) => {
                    console.log('Sending balance request...');
                    webSocketService.send(getBalancesPayload);
                })
                .catch((error) => {
                    console.error('Failed to create balance request:', error);
                    setIsLoadingBalances(false);
                });
        }
    }, [isAuthenticated, sessionKey, account]);

    const handleCreateAppSession = async (opts?: { silent?: boolean }) => {
        if (!isAuthenticated || !sessionKey || !account) {
            if (!opts?.silent) alert('Connect and authenticate first');
            return;
        }
        try {
            setCreateResult('Creating session...');
            const signer = createECDSAMessageSigner(sessionKey.privateKey);
            const appDefinition: RPCAppDefinition = {
                protocol: RPCProtocolVersion.NitroRPC_0_4,
                participants: [account, FIXED_PARTICIPANT_B] as unknown as `0x${string}`[],
                weights: DEFAULT_WEIGHTS,
                quorum: DEFAULT_QUORUM,
                challenge: 0,
                nonce: Date.now(),
            };
            const allocations: RPCAppSessionAllocation[] = [
                { participant: account as unknown as `0x${string}`, asset: 'usdc', amount },
                { participant: FIXED_PARTICIPANT_B as unknown as `0x${string}`, asset: 'usdc', amount: '0' },
            ];
            const signedMessage = await createAppSessionMessage(signer, {
                definition: appDefinition,
                allocations,
            });
            webSocketService.send(signedMessage);
        } catch (e) {
            setCreateResult(`Error: ${(e as Error).message}`);
        }
    };

    async function ensureOpenSessionAfterAuth(): Promise<void> {
        if (!sessionKey || !account) return;
        return new Promise<void>(async (resolve) => {
            let settled = false;
            const listener = async (data: any) => {
                try {
                    const resp = parseAnyRPCResponse(JSON.stringify(data));
                    const methodName = (resp?.method || '').toLowerCase();
                    if (methodName === 'getappsessions' || methodName === 'get_app_sessions') {
                        if (settled) return;
                        settled = true;
                        webSocketService.removeMessageListener(listener);
                        const sessions = parseGetAppSessionsResponse(JSON.stringify(data));
                        const list: any[] = sessions?.params?.appSessions ?? [];
                        const firstOpen = list.find((s: any) => (s.status || '').toLowerCase() === 'open');
                        if (firstOpen?.appSessionId) {
                            setCloseSessionId(firstOpen.appSessionId);
                            localStorage.setItem('app_session_id', firstOpen.appSessionId);
                            autoSessionEnsuredRef.current = true;
                            resolve();
                        } else {
                            autoSessionEnsuredRef.current = true;
                            try { await handleCreateAppSession({ silent: true }); } catch {}
                            resolve();
                        }
                    }
                } catch {}
            };
            webSocketService.addMessageListener(listener);
            try {
                const signer = createECDSAMessageSigner(sessionKey.privateKey);
                const timestamp = Date.now();
                const requestId = Math.floor(Math.random() * 1000000);
                const request = NitroliteRPC.createRequest({
                    requestId,
                    method: RPCMethod.GetAppSessions,
                    params: { participant: account },
                    timestamp,
                });
                const signedRequest = await NitroliteRPC.signRequestMessage(request, signer);
                webSocketService.send(JSON.stringify(signedRequest));
            } catch {
                webSocketService.removeMessageListener(listener);
                resolve();
            }
        });
    }

    const handleSubmitAppState = async () => {
        if (!isAuthenticated || !sessionKey || !account) {
            alert('Connect and authenticate first');
            return;
        }
        if (!closeSessionId) {
            alert('Enter an App Session ID');
            return;
        }
        try {
            setSubmitStateResult('Submitting app state...');
            const signer = createECDSAMessageSigner(sessionKey.privateKey);

            let statePayload: any = appStateValue;
            try {
                statePayload = JSON.parse(appStateValue);
            } catch {
                // keep as string if not valid JSON
            }

            const message = await createSubmitAppStateMessage(
                signer,
                {
                    appSessionId: closeSessionId,
                    state: statePayload,
                } as any,
            );
            webSocketService.send(message);
        } catch (e) {
            setSubmitStateResult(`Error: ${(e as Error).message}`);
        }
    };

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
                await ensureOpenSessionAfterAuth();
            }

            if (response.method === RPCMethod.GetLedgerBalances) {
                const balanceResponse = response as GetLedgerBalancesResponse;
                const balances = balanceResponse.params.ledgerBalances;

                console.log('Received balance response:', balances);

                if (balances && balances.length > 0) {
                    const balancesMap = Object.fromEntries(
                        balances.map((balance) => [balance.asset, balance.amount]),
                    );
                    console.log('Setting balances:', balancesMap);
                    setBalances(balancesMap);
                } else {
                    console.log('No balance data received - wallet appears empty');
                    setBalances({});
                }
                setIsLoadingBalances(false);
            }

            if (response.method === RPCMethod.BalanceUpdate) {
                const balanceUpdate = response as BalanceUpdateResponse;
                const balances = balanceUpdate.params.balanceUpdates;

                console.log('Live balance update received:', balances);

                const balancesMap = Object.fromEntries(
                    balances.map((balance) => [balance.asset, balance.amount]),
                );
                console.log('Updating balances in real-time:', balancesMap);
                setBalances(balancesMap);
            }

            if (response.method === RPCMethod.Transfer) {
                const transferResponse = response as TransferResponse;
                console.log('Transfer completed:', transferResponse.params);
                
                setIsTransferring(false);
                
                alert(`Transfer completed successfully!`);
            }

            // Handle errors
            if (response.method === RPCMethod.Error) {
                console.error('RPC Error:', response.params);
                
                if (isTransferring) {
                    setIsTransferring(false);
                    alert(`Transfer failed: ${response.params.error}`);
                } else {
                    removeJWT();
                    removeSessionKey();
                    alert(`Error: ${response.params.error}`);
                    setIsAuthAttempted(false);
                }
            }

            try {
                const created = parseCreateAppSessionResponse(JSON.stringify(data));
                if (created?.params?.appSessionId) {
                    setCreateResult(`Created app session: ${created.params.appSessionId}`);
                    setCloseSessionId(created.params.appSessionId);
                    localStorage.setItem('app_session_id', created.params.appSessionId);
                }
            } catch {}

            try {
                const closed = parseCloseAppSessionResponse(JSON.stringify(data));
                if (closed?.params?.appSessionId) {
                    setCloseResult(`Closed app session: ${closed.params.appSessionId}`);
                    localStorage.removeItem('app_session_id');
                }
            } catch {}

            try {
                const sessions = parseGetAppSessionsResponse(JSON.stringify(data));
                if (sessions?.params?.appSessions) {
                    setGetSessionsResult(JSON.stringify(sessions.params.appSessions, undefined, 2));
                    const list: any[] = sessions.params.appSessions;
                    const firstOpen = list.find((s: any) => (s.status || '').toLowerCase() === 'open');
                    if (firstOpen?.appSessionId) {
                        setCloseSessionId(firstOpen.appSessionId);
                        localStorage.setItem('app_session_id', firstOpen.appSessionId);
                        console.log('Auto-created session:', firstOpen.appSessionId);
                        autoSessionEnsuredRef.current = true;
                    } else {
                        autoSessionEnsuredRef.current = true;
                        try {
                            await handleCreateAppSession({ silent: true });
                        } catch (e) {
                            console.warn('Auto-create app session failed:', e);
                        }
                    }
                }
            } catch {}

            try {
                const submitted = parseSubmitAppStateResponse(JSON.stringify(data));
                if (submitted?.params?.appSessionId) {
                    setSubmitStateResult(`Submitted state for: ${submitted.params.appSessionId}`);
                }
            } catch {}
            const anyResp = response as any;
            if (anyResp?.method === 'GetAppState' && anyResp?.params?.state) {
                setGetStateResult(safeStringify(anyResp.params.state));
            }

            const methodName = (anyResp?.method || '').toLowerCase();
            if ((methodName === 'getchannels' || methodName === 'get_channels') && anyResp?.params) {
                setChannelsResult(safeStringify(anyResp.params));
            }
            if ((methodName === 'getrpchistory' || methodName === 'get_rpc_history') && anyResp?.params) {
                setRpcHistoryResult(safeStringify(anyResp.params));
                if (deriveStateFromHistory) {
                    try {
                        const entries: any[] = anyResp.params.history ?? anyResp.params.entries ?? anyResp.params;
                        const lastWithState = Array.isArray(entries)
                            ? [...entries].reverse().find((e) => {
                                  const raw = e?.params ?? e?.request?.params ?? e;
                                  let p = raw;
                                  if (typeof raw === 'string') {
                                      try { p = JSON.parse(raw); } catch {}
                                  }
                                  return p && (p.state !== undefined || p.session_data !== undefined);
                              })
                            : undefined;
                        if (lastWithState) {
                            let p = lastWithState.params ?? lastWithState.request?.params ?? lastWithState;
                            if (typeof p === 'string') {
                                try { p = JSON.parse(p); } catch {}
                            }
                            const stateVal = p.state ?? p.session_data;
                            setGetStateResult(typeof stateVal === 'string' ? stateVal : safeStringify(stateVal));
                        } else {
                            setGetStateResult('No state found in RPC history');
                        }
                    } catch (err) {
                        setGetStateResult('Failed to derive state from RPC history');
                    } finally {
                        setDeriveStateFromHistory(false);
                    }
                }
            }
        };

        webSocketService.addMessageListener(handleMessage);
        return () => webSocketService.removeMessageListener(handleMessage);
    }, [walletClient, sessionKey, sessionExpireTimestamp, account, isTransferring]);

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

    const formatAddress = (address: Address) => `${address.slice(0, 6)}...${address.slice(-4)}`;


    return (
       <>
       {account ? (
            <div>
                <div>Connected: {formatAddress(account)}</div>
                <div style={{ marginTop: 12 }}>
                    <button onClick={() => handleCreateAppSession()}>Create Session</button>
                </div>
                <div style={{ marginTop: 12 }}>
                    <input
                        placeholder="App Session ID"
                        value={closeSessionId}
                        onChange={(e) => setCloseSessionId(e.target.value)}
                        style={{ width: '100%', maxWidth: 480 }}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <input
                        placeholder='App State JSON or text'
                        value={appStateValue}
                        onChange={(e) => setAppStateValue(e.target.value)}
                        style={{ width: '100%', maxWidth: 480 }}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <button onClick={handleSubmitAppState} disabled={!closeSessionId || !appStateValue}>Submit App State</button>
                </div>
            </div>
             ) : (
            <button onClick={connectWallet}>
                Authenticate
             </button>
             )}
        </>
    );
}