'use client'
import BackgroundTerminal from '../components/BackgroundTerminal';
import GlitchText from '../components/GlitchText';
import GlassNavbar from '../components/GlassNavbar';
import { useState } from 'react';
import { FiLock, FiUnlock, FiCopy, FiCheck } from 'react-icons/fi';

export default function EncryptPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [encryptedData, setEncryptedData] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [decryptedData, setDecryptedData] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Asymmetric encryption using public key with hybrid approach
  const encryptData = async (data: string, publicKeyString: string) => {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      // Generate RSA key pair for demonstration
      // In a real implementation, you'd use the actual public key from the wallet
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );
      
      // Store the private key for decryption
      (window as any).demoPrivateKey = keyPair.privateKey;
      
      // For large data, use hybrid encryption (AES + RSA)
      if (dataBuffer.length > 190) { // RSA-OAEP with 2048-bit key can encrypt max ~190 bytes
        // Generate a random AES key
        const aesKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        
        // Encrypt the data with AES
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedData = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: iv },
          aesKey,
          dataBuffer
        );
        
        // Export the AES key and encrypt it with RSA
        const exportedAesKey = await crypto.subtle.exportKey('raw', aesKey);
        const encryptedAesKey = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          keyPair.publicKey,
          exportedAesKey
        );
        
        // Combine IV + encrypted AES key + encrypted data
        const combined = new Uint8Array(4 + iv.length + encryptedAesKey.byteLength + encryptedData.byteLength);
        const view = new DataView(combined.buffer);
        view.setUint32(0, iv.length, false); // Store IV length
        combined.set(iv, 4);
        combined.set(new Uint8Array(encryptedAesKey), 4 + iv.length);
        combined.set(new Uint8Array(encryptedData), 4 + iv.length + encryptedAesKey.byteLength);
        
        return btoa(String.fromCharCode(...combined));
      } else {
        // For small data, use RSA directly
        const encrypted = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          keyPair.publicKey,
          dataBuffer
        );
        
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      }
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Encryption failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Asymmetric decryption using private key with hybrid support
  const decryptData = async (encryptedData: string, privateKeyString: string) => {
    try {
      const encoder = new TextEncoder();
      
      // For demo purposes, we'll use the stored private key
      // In a real implementation, you'd derive the private key from the private key string
      const privateKey = (window as any).demoPrivateKey;
      
      if (!privateKey) {
        throw new Error('Private key not found. Please encrypt data first.');
      }
      
      // Decode from base64
      const encrypted = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      
      // Check if this is hybrid encryption (has length prefix)
      if (encrypted.length > 4) {
        const view = new DataView(encrypted.buffer);
        const ivLength = view.getUint32(0, false);
        
        if (ivLength === 12 && encrypted.length > 4 + ivLength) {
          // This is hybrid encryption
          const iv = encrypted.slice(4, 4 + ivLength);
          const encryptedAesKey = encrypted.slice(4 + ivLength, 4 + ivLength + 256); // RSA encrypted key is 256 bytes
          const encryptedData = encrypted.slice(4 + ivLength + 256);
          
          // Decrypt the AES key with RSA
          const decryptedAesKey = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' },
            privateKey,
            encryptedAesKey
          );
          
          // Import the AES key
          const aesKey = await crypto.subtle.importKey(
            'raw',
            decryptedAesKey,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );
          
          // Decrypt the data with AES
          const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            encryptedData
          );
          
          return new TextDecoder().decode(decrypted);
        }
      }
      
      // Fallback to direct RSA decryption
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encrypted
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Decryption failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleEncrypt = async () => {
    if (!walletAddress.trim() || !jsonData.trim()) {
      alert('Please enter both wallet address and JSON data');
      return;
    }

    setIsEncrypting(true);
    try {
      const encrypted = await encryptData(jsonData, walletAddress);
      setEncryptedData(encrypted);
    } catch (error) {
      alert('Encryption failed. Please try again.');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDecrypt = async () => {
    if (!privateKey.trim() || !encryptedData.trim()) {
      alert('Please enter both private key and encrypted data');
      return;
    }

    setIsDecrypting(true);
    try {
      // Use the same key derivation method for decryption
      const decrypted = await decryptData(encryptedData, privateKey);
      setDecryptedData(decrypted);
    } catch (error) {
      alert('Decryption failed. Please check your private key.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <BackgroundTerminal />
      <GlassNavbar />
      
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          width: '90%',
          maxWidth: '1200px',
          height: '80%',
          display: 'flex',
          flexDirection: 'column',
          padding: '32px 40px',
          borderRadius: 24,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '32px'
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: 2,
              color: '#A7EF9E',
              textShadow: '0 2px 10px rgba(167,239,158,0.25)',
              marginBottom: '8px'
            }}
          >
            <GlitchText
              speed={1}
              enableShadows={true}
              enableOnHover={false}
            >
              Data Encryption
            </GlitchText>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '16px' }}>
            Asymmetric encryption: Public key encrypts, Private key decrypts
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginTop: '8px' }}>
            Note: This is a demo implementation. In production, use proper key derivation from wallet keys.
          </p>
        </div>

        {/* Main Content - Two Columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '32px',
            flex: 1,
            minHeight: 0
          }}
        >
          {/* Left Column - Encryption */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <h3 style={{ 
              color: '#A7EF9E', 
              fontSize: '20px', 
              fontWeight: 700,
              margin: 0,
              textAlign: 'center'
            }}>
              Encryption
            </h3>
            
            {/* Wallet Address Input */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255,255,255,0.8)', 
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600
              }}>
                Public Key (Wallet Address)
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Enter wallet public address..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 200ms ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#A7EF9E';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
              />
            </div>

            {/* JSON Data Input */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255,255,255,0.8)', 
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600
              }}>
                JSON Data
              </label>
              <textarea
                value={jsonData}
                onChange={(e) => setJsonData(e.target.value)}
                placeholder="Enter your JSON data here..."
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '200px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  transition: 'border-color 200ms ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#A7EF9E';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
              />
            </div>

            {/* Encrypt Button */}
            <button
              onClick={handleEncrypt}
              disabled={isEncrypting}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                border: '1px solid #A7EF9E',
                background: isEncrypting ? 'rgba(167,239,158,0.3)' : '#A7EF9E',
                color: 'black',
                cursor: isEncrypting ? 'not-allowed' : 'pointer',
                transition: 'all 200ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '16px',
                opacity: isEncrypting ? 0.7 : 1
              }}
            >
              <FiLock size={18} />
              {isEncrypting ? 'Encrypting...' : 'Encrypt Data'}
            </button>
          </div>

          {/* Right Column - Decryption */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <h3 style={{ 
              color: '#A7EF9E', 
              fontSize: '20px', 
              fontWeight: 700,
              margin: 0,
              textAlign: 'center'
            }}>
              Decryption
            </h3>

            {/* Encrypted Data Display */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255,255,255,0.8)', 
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600
              }}>
                Encrypted Data
              </label>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={encryptedData}
                  readOnly
                  placeholder="Encrypted data will appear here..."
                  style={{
                    width: '100%',
                    height: '120px',
                    padding: '12px 16px',
                    paddingRight: '40px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    resize: 'none',
                    outline: 'none'
                  }}
                />
                {encryptedData && (
                  <button
                    onClick={() => copyToClipboard(encryptedData)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      padding: '6px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                  </button>
                )}
              </div>
            </div>

            {/* Private Key Input */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255,255,255,0.8)', 
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600
              }}>
                Private Key
              </label>
              <input
                type="password"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter private key to decrypt..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 200ms ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#A7EF9E';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
              />
            </div>

            {/* Decrypt Button */}
            <button
              onClick={handleDecrypt}
              disabled={isDecrypting}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                border: '1px solid #A7EF9E',
                background: isDecrypting ? 'rgba(167,239,158,0.3)' : '#A7EF9E',
                color: 'black',
                cursor: isDecrypting ? 'not-allowed' : 'pointer',
                transition: 'all 200ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '16px',
                opacity: isDecrypting ? 0.7 : 1
              }}
            >
              <FiUnlock size={18} />
              {isDecrypting ? 'Decrypting...' : 'Decrypt Data'}
            </button>

            {/* Decrypted Data Display */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255,255,255,0.8)', 
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600
              }}>
                Decrypted Data
              </label>
              <textarea
                value={decryptedData}
                readOnly
                placeholder="Decrypted data will appear here..."
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '200px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
