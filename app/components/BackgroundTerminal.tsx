'use client'
import React from 'react';
import dynamic from 'next/dynamic';

const FaultyTerminal = dynamic(() => import('./FaultyTerminal'), { ssr: false });

function BackgroundTerminalInner() {
  return (
    <FaultyTerminal
      scale={3}
      gridMul={[2, 1]}
      digitSize={1.2}
      timeScale={.5}
      pause={false}
      scanlineIntensity={1}
      glitchAmount={1}
      flickerAmount={1}
      noiseAmp={1}
      chromaticAberration={0}
      dither={0}
      curvature={0}
      tint="#A7EF9E"
      mouseReact={true}
      mouseStrength={0.5}
      pageLoadAnimation={false}
      brightness={1}
    />
  );
}

const BackgroundTerminal = React.memo(BackgroundTerminalInner);
export default BackgroundTerminal;


