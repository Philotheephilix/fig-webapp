'use client'
import React, { useMemo } from 'react';

export default function GlassNavbar() {
  const platform = useMemo(() => {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent || '';
    const plat = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform || navigator.platform || '';
    const hay = `${ua} ${plat}`.toLowerCase();
    if (hay.includes('mac')) return 'mac';
    if (hay.includes('win')) return 'windows';
    if (hay.includes('linux')) return 'linux';
    return 'unknown';
  }, []);

  const iconStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgb(0, 0, 0)'
  };

  const PlatformIcon = () => {
    if (platform === 'mac') {
      return (
        <span title="macOS" aria-label="macOS" style={{ ...iconStyle }}>
          <span style={{ fontSize: 12 }}></span>
        </span>
      );
    }
    if (platform === 'windows') {
      return (
        <span title="Windows" aria-label="Windows" style={{ ...iconStyle }}>
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <rect x="1" y="3" width="9" height="8" fill="black" />
            <rect x="12" y="3" width="11" height="8" fill="black" />
            <rect x="1" y="13" width="9" height="8" fill="black" />
            <rect x="12" y="13" width="11" height="8" fill="black" />
          </svg>
        </span>
      );
    }
    if (platform === 'linux') {
      return (
        <span title="Linux" aria-label="Linux" style={{ ...iconStyle }}>
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <circle cx="12" cy="8" r="3" fill="black" />
            <rect x="9" y="11" width="6" height="7" rx="3" fill="black" />
          </svg>
        </span>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 16px',
        borderRadius: 9999,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'white'
      }}
    >
      <span style={{ fontWeight: 700, letterSpacing: 2, color: 'white' }}>FIG</span>
      <button
        style={{
          marginLeft: 16,
          padding: '6px 12px',
          borderRadius: 9999,
          color: 'black',
          border: '1px solid black',
          background: '#A7EF9E',
          cursor: 'pointer',
          transition: 'background 200ms ease, border-color 200ms ease',
          display: 'inline-flex',
          alignItems: 'center',
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
        <PlatformIcon />
        Download
      </button>
    </div>
  );
}


