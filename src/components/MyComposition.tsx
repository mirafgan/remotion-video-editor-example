// MyVideoComposition.tsx
import React from 'react';
import {AbsoluteFill, Video, Sequence, Audio} from 'remotion';

export const VIDEO_FPS = 30;

export type TextLayer = {
    id: string;
    text: string;
    startSec: number;
    endSec: number;
    x: number; // 0–1
    y: number; // 0–1
    w: number; // 0–1
    h: number; // 0–1
};

export type AudioLayer = {
    id: string;
    src: string;
    startSec: number;
    endSec: number;
};

export type MyVideoCompositionProps = {
    mainVideoSrc: string | null;
    durationInFrames: number;
    textLayers: TextLayer[];
    audioLayers: AudioLayer[];
};

export const MyVideoComposition: React.FC<MyVideoCompositionProps> = ({
                                                                          mainVideoSrc,
                                                                          durationInFrames,
                                                                          textLayers,
                                                                          audioLayers,
                                                                      }) => {
    const fps = VIDEO_FPS;
    const durationSec = durationInFrames / fps;

    const secToFrames = (sec: number) =>
        Math.max(0, Math.round(sec * fps));

    return (
        <AbsoluteFill style={{backgroundColor: '#111'}}>
            {/* MAIN VIDEO */}
            {mainVideoSrc && (
                <AbsoluteFill>
                    <Video
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

            {/* TEXT LAYERS */}

            {/* AUDIO LAYERS */}
            {audioLayers.map((layer) => {
                const startFrame = secToFrames(layer.startSec);
                const endFrame = secToFrames(layer.endSec);
                const duration = Math.max(0, endFrame - startFrame);

                if (!layer.src || duration <= 0) return null;

                return (
                    <Sequence
                        key={layer.id}
                        from={startFrame}
                        durationInFrames={duration}
                    >
                        <Audio src={layer.src} />
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};

export default MyVideoComposition;
