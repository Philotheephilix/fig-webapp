'use client'
import BackgroundTerminal from './components/BackgroundTerminal';
import GlitchText from './components/GlitchText';
import { useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import GlassSearchBox from './components/GlassSearchBox';
import GlassNavbar from './components/GlassNavbar';

export default function Page() {
  const [showSearch, setShowSearch] = useState(false);
  return (
<div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
    <BackgroundTerminal />
  <GlassNavbar />
  <div
    style={{
      height: '55%',
      width: '60%',
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
    }}
  >
    <div
      style={{
        fontSize: 48,
        fontWeight: 800,
        letterSpacing: 4,
        color: '#A7EF9E',
        textShadow: '0 2px 10px rgba(167,239,158,0.25)'
      }}
    >
      <GlitchText
        speed={1}
        enableShadows={true}
        enableOnHover={false}
      >
        Fig Search
      </GlitchText>
    </div>
    <button
        onClick={() => setShowSearch(true)}
        style={{
          opacity: showSearch ? 0 : 1,
          pointerEvents: showSearch ? 'none' : 'auto',
          marginLeft: 16,
          padding: '10px 16px',
          borderRadius: 9999,
          border: '1px solid black',
          background: '#A7EF9E',
          color: 'black',
          cursor: 'pointer',
          transition: 'opacity 300ms ease-in-out, background 200ms ease-in-out, border-color 200ms ease-in-out',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 700,
          letterSpacing: 0.5,
          fontSize: 18
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
        <FiSearch size={20} />
        Start Searching
      </button>
    <GlassSearchBox visible={showSearch} placement="inline" />
    </div>
  </div>
  );
}