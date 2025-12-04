// MyVideoComposition.jsx
import React from 'react';
import {AbsoluteFill, Html5Video, Sequence, Html5Audio} from 'remotion';

export const VIDEO_FPS = 30;

export const Main = ({
                                       mainVideoSrc,
                                       durationInFrames = 300, // Player'dan da override edilecek
                                       textLayers = [],
                                       audioLayers = [],
                                   }) => {
    const fps = VIDEO_FPS;
    const durationSec = durationInFrames / fps;

    const secToFrames = (sec) => Math.max(0, Math.round(sec * fps));

    return (
        <AbsoluteFill style={{backgroundColor: '#111'}}>
            {/* ANA VİDEO */}
            {mainVideoSrc && (
                <AbsoluteFill>
                    <Html5Video
                        src={mainVideoSrc}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain', // object-contain etkisi
                            backgroundColor: 'black',
                        }}
                    />
                </AbsoluteFill>
            )}

            {/* TEXT LAYER’LAR */}
            {textLayers.map((layer) => {
                const start = secToFrames(layer.startSec ?? 0);
                const end = secToFrames(layer.endSec ?? durationSec);
                const duration = Math.max(0, end - start);
                if (duration <= 0 || !layer.text) return null;

                const x = layer.x ?? 0.2;
                const y = layer.y ?? 0.7;
                const w = layer.w ?? 0.6;
                const h = layer.h ?? 0.18;

                return (
                    <Sequence
                        key={layer.id}
                        from={start}
                        durationInFrames={duration}
                    >
                        <AbsoluteFill>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${x * 100}%`,
                                    top: `${y * 100}%`,
                                    width: `${w * 100}%`,
                                    height: `${h * 100}%`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 8,
                                }}
                            >
                                <div
                                    style={{
                                        backgroundColor: 'rgba(0,0,0,0.6)',
                                        color: 'white',
                                        width: '100%',
                                        height: '100%',
                                        borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 40,
                                        textAlign: 'center',
                                        padding: '6px 12px',
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    {layer.text}
                                </div>
                            </div>
                        </AbsoluteFill>
                    </Sequence>
                );
            })}

            {/* AUDIO LAYER’LAR */}
            {audioLayers.map((layer) => {
                if (!layer.src) return null;
                const start = secToFrames(layer.startSec ?? 0);
                const end = secToFrames(layer.endSec ?? durationSec);
                const duration = Math.max(0, end - start);
                if (duration <= 0) return null;

                return (
                    <Sequence
                        key={layer.id}
                        from={start}
                        durationInFrames={duration}
                    >
                        <Html5Audio src={layer.src} />
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};

