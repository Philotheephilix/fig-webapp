'use client'
import React from 'react';
import { SiGithub, SiWikipedia, SiYoutube, SiEthereum } from 'react-icons/si';

type GlassSearchBoxProps = {
  visible: boolean;
  placement?: 'overlay' | 'inline';
};

export default function GlassSearchBox({ visible, placement = 'overlay' }: GlassSearchBoxProps) {
  const quickLinks = [
    { name: 'Github', href: 'https://github.com/', Icon: SiGithub },
    { name: 'Wikipedia', href: 'https://en.wikipedia.org/', Icon: SiWikipedia },
    { name: 'YouTube', href: 'https://www.youtube.com/', Icon: SiYoutube },
    { name: 'EthGlobal', href: 'https://ethglobal.com/', Icon: SiEthereum }
  ]
  return (
    <><div
      style={{
        position: placement === 'overlay' ? 'absolute' : 'static',
        top: placement === 'overlay' ? '50%' : undefined,
        left: placement === 'overlay' ? '50%' : undefined,
        transform: placement === 'overlay'
          ? (visible
            ? 'translate(-50%, -50%) scale(1)'
            : 'translate(-50%, -50%) scale(0.98)')
          : undefined,
        width: 'min(720px, 90vw)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        opacity: visible ? 1 : 0,
        marginTop: placement === 'inline' ? 16 : undefined,
        transition: placement === 'overlay'
          ? 'opacity 350ms ease-in-out, transform 350ms ease-in-out'
          : 'opacity 300ms ease-in-out',
        pointerEvents: visible ? 'auto' : 'none'
      }}
    >
      <input
        type="text"
        placeholder="Search FIG..."
        style={{
          flex: 1,
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(0,0,0,0.25)',
          color: 'white',
          outline: 'none',
          fontSize: 16,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)'
        }} />
      <button
        style={{
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid rgba(167,239,158,0.6)',
          background: 'linear-gradient(180deg, rgba(167,239,158,0.35), rgba(167,239,158,0.20))',
          color: '#0c1d12',
          fontWeight: 700,
          letterSpacing: 1,
          cursor: 'pointer',
          textTransform: 'uppercase',
          boxShadow: '0 6px 20px rgba(167,239,158,0.25)'
        }}
      >
        Search
      </button>
    </div>
    <div
      style={{
        position: placement === 'overlay' ? 'absolute' : 'static',
        top: placement === 'overlay' ? '50%' : undefined,
        left: placement === 'overlay' ? '50%' : undefined,
        transform: placement === 'overlay'
          ? (visible
            ? 'translate(-50%, -50%) scale(1)'
            : 'translate(-50%, -50%) scale(0.98)')
          : undefined,
        width: 'min(720px, 90vw)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        marginTop: placement === 'inline' ? 16 : undefined,
        opacity: visible ? 1 : 0,
        transition: placement === 'overlay'
          ? 'opacity 350ms ease-in-out, transform 350ms ease-in-out'
          : 'opacity 300ms ease-in-out',
        pointerEvents: visible ? 'auto' : 'none'
      }}
    >
      <div className='text-[#A7EF9E] text-xl font-bold'>Quick Links</div>
      <div className='flex flex-row flex-wrap items-center justify-center gap-6'>
        {quickLinks.map(({ name, href, Icon }) => (
          <a
            key={href}
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(167,239,158,0.6)',
              background: 'linear-gradient(180deg, rgba(167,239,158,0.35), rgba(167,239,158,0.20))',
              color: '#0c1d12',
              boxShadow: '0 6px 20px rgba(167,239,158,0.25)'
            }}
          >
            <Icon size={28} />
            <span className='text-sm'>{name}</span>
          </a>
        ))}
      </div>
    </div></>
  );
}


