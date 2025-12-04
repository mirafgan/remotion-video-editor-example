// VideoEditor.tsx
"use client"
import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {Rnd} from 'react-rnd';
import MyVideoComposition, {
    AUDIO_FPS,
    MyVideoCompositionProps,
    TextLayer,
    AudioLayer,
    VIDEO_FPS,
} from './MyComposition';

const TIMELINE_BASE_WIDTH = 900; // px approx

type DragMode = 'move' | 'resize-left' | 'resize-right';

type TimelineDragState = {
    type: 'text' | 'audio';
    id: string;
    mode: DragMode;
    startX: number;
    startStartSec: number;
    startEndSec: number;
} | null;

// küçük helper
const createId = (() => {
    let i = 1;
    return () => String(i++);
})();

export const VideoEditor: React.FC = () => {
    const [mainFileUrl, setMainFileUrl] = useState<string | null>(null);
    const [mainUrl, setMainUrl] = useState<string>('');
    const [durationInFrames, setDurationInFrames] = useState<number>(
        300
    ); // default 10s

    const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
    const [audioLayers, setAudioLayers] = useState<AudioLayer[]>([]);
    const [selectedTextId, setSelectedTextId] = useState<string | null>(
        null
    );

    const [currentFrame, setCurrentFrame] = useState<number>(0);
    const playerRef = useRef<PlayerRef | null>(null);

    // overlay ve timeline ölçüleri
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [overlaySize, setOverlaySize] = useState<{
        width: number;
        height: number;
    }>({width: 1600, height: 900});

    const timelineRef = useRef<HTMLDivElement | null>(null);
    const [timelineWidth, setTimelineWidth] = useState<number>(
        TIMELINE_BASE_WIDTH
    );

    const [timelineDrag, setTimelineDrag] =
        useState<TimelineDragState>(null);

    const [playheadDragging, setPlayheadDragging] =
        useState<boolean>(false);

    // text modal
    const [isTextModalOpen, setIsTextModalOpen] =
        useState<boolean>(false);
    const [newTextValue, setNewTextValue] = useState<string>('');

    const durationSec = durationInFrames / VIDEO_FPS;
    const currentSec = currentFrame / VIDEO_FPS;

    const effectiveMainSrc =
        mainFileUrl || mainUrl.trim() || null;

    // --- DOM ölçüleri (overlay & timeline) ---
    useEffect(() => {
        const overlayEl = overlayRef.current;
        if (!overlayEl) return;

        const update = () => {
            setOverlaySize({
                width: overlayEl.clientWidth,
                height: overlayEl.clientHeight,
            });
        };
        update();

        const ro = new ResizeObserver(update);
        ro.observe(overlayEl);

        return () => ro.disconnect();
    }, []);


    useEffect(() => {
        const tl = timelineRef.current;
        if (!tl) return;

        const update = () => {
            setTimelineWidth(tl.clientWidth);
        };
        update();

        const ro = new ResizeObserver(update);
        ro.observe(tl);
        return () => ro.disconnect();
    }, []);

    // --- Video metadata'dan süre ölç ---
    useEffect(() => {
        if (!effectiveMainSrc) return;

        const video = document.createElement('video');
        video.src = effectiveMainSrc;
        video.preload = 'metadata';

        const onLoaded = () => {
            if (isFinite(video.duration) && video.duration > 0) {
                const frames = Math.round(video.duration * VIDEO_FPS);
                setDurationInFrames(frames);
            }
        };

        video.addEventListener('loadedmetadata', onLoaded);
        return () => {
            video.removeEventListener('loadedmetadata', onLoaded);
        };
    }, [effectiveMainSrc]);

    // blob cleanup
    useEffect(() => {
        return () => {
            if (mainFileUrl) URL.revokeObjectURL(mainFileUrl);
            audioLayers.forEach((a) => {
                if (a.src.startsWith('blob:')) {
                    URL.revokeObjectURL(a.src);
                }
            });
        };
    }, [mainFileUrl, audioLayers]);

    const handleMainUploadClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            setMainFileUrl(url);
        };
        input.click();
    };

    const handleAddAudioFile = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);

        const newLayer: AudioLayer = {
            id: createId(),
            src: url,
            startSec: 0,
            endSec: durationSec,
        };
        setAudioLayers((prev) => [...prev, newLayer]);

        e.target.value = '';
    };

    // --- Text modal logic ---
    const openTextModal = () => {
        setNewTextValue('');
        setIsTextModalOpen(true);
    };

    const confirmNewText = () => {
        if (!newTextValue.trim()) {
            setIsTextModalOpen(false);
            return;
        }
        const start = currentSec;
        const end = Math.min(currentSec + 2, durationSec || 2);

        const newLayer: TextLayer = {
            id: createId(),
            text: newTextValue.trim(),
            startSec: start,
            endSec: end,
            x: 0.25,
            y: 0.7,
            w: 0.5,
            h: 0.18,
        };
        setTextLayers((prev) => [...prev, newLayer]);
        setSelectedTextId(newLayer.id);
        setIsTextModalOpen(false);
    };

    // --- Canvas (preview) üzerindeki text drag/resize ---
    const updateTextFromOverlay = (
        id: string,
        box: { x: number; y: number; width: number; height: number }
    ) => {
        const {width, height} = overlaySize;
        if (!width || !height) return;

        const nx = box.x / width;
        const ny = box.y / height;
        const nw = box.width / width;
        const nh = box.height / height;

        setTextLayers((layers) =>
            layers.map((l) =>
                l.id === id
                    ? {...l, x: nx, y: ny, w: nw, h: nh}
                    : l
            )
        );
    };

    // --- TIMELINE DRAG / RESIZE (text & audio) ---
    const secPerPx =
        durationSec > 0 ? durationSec / timelineWidth : 0.01;

    const startTimelineDrag = (
        type: 'text' | 'audio',
        id: string,
        mode: DragMode,
        event: React.MouseEvent<HTMLDivElement>
    ) => {
        event.stopPropagation();

        const source =
            type === 'text'
                ? textLayers.find((l) => l.id === id)
                : audioLayers.find((l) => l.id === id);

        if (!source) return;

        setTimelineDrag({
            type,
            id,
            mode,
            startX: event.clientX,
            startStartSec: source.startSec,
            startEndSec: source.endSec,
        });

        if (type === 'text') setSelectedTextId(id);
    };

    useEffect(() => {
        if (!timelineDrag) return;

        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - timelineDrag.startX;
            const dSec = dx * secPerPx;

            const clampSec = (start: number, end: number) => {
                const minDur = 0.1;
                let s = start;
                let en = end;

                s = Math.max(0, s);
                en = Math.max(s + minDur, en);
                if (en > durationSec) {
                    en = durationSec;
                    s = Math.max(0, en - minDur);
                }
                return {s, en};
            };

            if (timelineDrag.type === 'text') {
                setTextLayers((layers) =>
                    layers.map((l) => {
                        if (l.id !== timelineDrag.id) return l;
                        let start = l.startSec;
                        let end = l.endSec;

                        if (timelineDrag.mode === 'move') {
                            start = timelineDrag.startStartSec + dSec;
                            end = timelineDrag.startEndSec + dSec;
                        } else if (timelineDrag.mode === 'resize-left') {
                            start = timelineDrag.startStartSec + dSec;
                        } else {
                            end = timelineDrag.startEndSec + dSec;
                        }

                        const {s, en} = clampSec(start, end);
                        return {...l, startSec: s, endSec: en};
                    })
                );
            } else {
                setAudioLayers((layers) =>
                    layers.map((l) => {
                        if (l.id !== timelineDrag.id) return l;
                        let start = l.startSec;
                        let end = l.endSec;

                        if (timelineDrag.mode === 'move') {
                            start = timelineDrag.startStartSec + dSec;
                            end = timelineDrag.startEndSec + dSec;
                        } else if (timelineDrag.mode === 'resize-left') {
                            start = timelineDrag.startStartSec + dSec;
                        } else {
                            end = timelineDrag.startEndSec + dSec;
                        }

                        const {s, en} = clampSec(start, end);
                        return {...l, startSec: s, endSec: en};
                    })
                );
            }
        };

        const onUp = () => setTimelineDrag(null);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [timelineDrag, secPerPx, durationSec]);
    useEffect(() => {
        const current = playerRef.current;
        if (!current) return;

        const onFrameUpdate = () => {
            console.log(current.getCurrentFrame());
            setCurrentFrame(current.getCurrentFrame());
        };

        current.addEventListener('frameupdate', onFrameUpdate);

        return () => {
            current.removeEventListener('frameupdate', onFrameUpdate);
        };
    }, [mainUrl, mainFileUrl]);

    // --- PLAYHEAD (dikey çizgi) ---
    const playheadX = useMemo(() => durationSec > 0
        ? (currentFrame / (durationInFrames - 1)) * timelineWidth
        : 0, [currentFrame, durationSec]);
    const jumpToFrame = (frame: number) => {
        const clamped = Math.max(
            0,
            Math.min(frame, durationInFrames - 1)
        );
        setCurrentFrame(clamped);
        playerRef.current?.seekTo(clamped);
    };

    const handleTimelineClick = (
        e: React.MouseEvent<HTMLDivElement>
    ) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = Math.max(
            0,
            Math.min(e.clientX - rect.left, rect.width)
        );
        const ratio = rect.width ? x / rect.width : 0;
        const sec = ratio * durationSec;
        const frame = Math.round(sec * VIDEO_FPS);
        jumpToFrame(frame);
    };

    useEffect(() => {
        if (!playheadDragging) return;
        const tl = timelineRef.current;
        if (!tl) return;

        const onMove = (e: MouseEvent) => {
            const rect = tl.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const ratio = rect.width ? x / rect.width : 0;
            const sec = ratio * durationSec;
            const frame = Math.round(sec * VIDEO_FPS);
            jumpToFrame(frame); // ✅ seekTo + state sync
        };

        const onUp = () => setPlayheadDragging(false);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [playheadDragging, durationSec, durationInFrames]);

    const renderTimelineScale = () => {
        const markers = [];
        for (let sec = 0; sec <= durationSec; sec += 10) {
            const x = (sec / durationSec) * timelineWidth;
            markers.push(
                <div key={sec}
                     style={{position: 'absolute', left: x, top: 0, width: 1, height: 12, background: '#333'}}>
        <span style={{position: 'absolute', top: -18, fontSize: 10, color: '#111'}}>
          {String(sec).padStart(2, '0')}s
        </span>
                </div>
            );
        }
        return markers;
    };


    const handlePlayheadMouseDown = (
        e: React.MouseEvent<HTMLDivElement>
    ) => {
        e.stopPropagation();
        setPlayheadDragging(true);
    };

    // --- inputProps for Player ---
    const inputProps: MyVideoCompositionProps = useMemo(
        () => ({
            mainVideoSrc: effectiveMainSrc,
            durationInFrames,
            textLayers,
            audioLayers,
        }),
        [effectiveMainSrc, durationInFrames, textLayers, audioLayers]
    );

    // --- RENDER HELPERS (timeline tracks) ---
    const renderTextTrack = () => (
        <div
            style={{
                position: 'relative',
                height: 40,
                background: '#f3f3f3',
                borderRadius: 6,
                overflow: 'hidden',
            }}
        >
            {textLayers.map((l) => {
                const left =
                    (l.startSec / durationSec) * timelineWidth;
                const width =
                    ((l.endSec - l.startSec) / durationSec) *
                    timelineWidth;

                return (
                    <div
                        key={l.id}
                        onMouseDown={(e) =>
                            startTimelineDrag('text', l.id, 'move', e)
                        }
                        style={{
                            position: 'absolute',
                            left,
                            width,
                            top: 4,
                            bottom: 4,
                            background:
                                l.id === selectedTextId
                                    ? '#ff9f1c'
                                    : 'rgba(255,159,28,0.85)',
                            borderRadius: 4,
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px',
                            fontSize: 12,
                            color: '#222',
                        }}
                    >
            <span
                style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
              {l.text}
            </span>
                        {/* left handle */}
                        <div
                            onMouseDown={(e) =>
                                startTimelineDrag(
                                    'text',
                                    l.id,
                                    'resize-left',
                                    e
                                )
                            }
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 6,
                                cursor: 'ew-resize',
                                background: 'rgba(0,0,0,0.25)',
                            }}
                        />
                        {/* right handle */}
                        <div
                            onMouseDown={(e) =>
                                startTimelineDrag(
                                    'text',
                                    l.id,
                                    'resize-right',
                                    e
                                )
                            }
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: 6,
                                cursor: 'ew-resize',
                                background: 'rgba(0,0,0,0.25)',
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );

    const renderAudioTrack = () => (
        <div
            style={{
                position: 'relative',
                height: 40,
                background: '#f3f3f3',
                borderRadius: 6,
                overflow: 'hidden',
            }}
        >
            {audioLayers.map((l) => {
                const left =
                    (l.startSec / durationSec) * timelineWidth;
                const width =
                    ((l.endSec - l.startSec) / durationSec) *
                    timelineWidth;

                return (
                    <div
                        key={l.id}
                        onMouseDown={(e) =>
                            startTimelineDrag('audio', l.id, 'move', e)
                        }
                        style={{
                            position: 'absolute',
                            left,
                            width,
                            top: 4,
                            bottom: 4,
                            background: '#1ccad8',
                            borderRadius: 4,
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px',
                            fontSize: 12,
                            color: '#222',
                        }}
                    >
            <span
                style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
              Audio
            </span>
                        <div
                            onMouseDown={(e) =>
                                startTimelineDrag(
                                    'audio',
                                    l.id,
                                    'resize-left',
                                    e
                                )
                            }
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 6,
                                cursor: 'ew-resize',
                                background: 'rgba(0,0,0,0.25)',
                            }}
                        />
                        <div
                            onMouseDown={(e) =>
                                startTimelineDrag(
                                    'audio',
                                    l.id,
                                    'resize-right',
                                    e
                                )
                            }
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: 6,
                                cursor: 'ew-resize',
                                background: 'rgba(0,0,0,0.25)',
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );

    return (
        <div
            style={{
                fontFamily:
                    'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
            }}
        >
            {/* ÜST: Player alanı + sağ controls */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    padding: 16,
                    gap: 16,
                    minHeight: 0,
                }}
            >
                {/* SOL: Player + overlay */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                    }}
                >
                    {/* Upload butonu */}
                    <button
                        onClick={handleMainUploadClick}
                        style={{
                            marginBottom: 8,
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: 'none',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        Video Upload
                    </button>

                    {/* Player sadece video varsa göster */}
                    {effectiveMainSrc ? (
                        <div
                            style={{
                                position: 'relative',
                                width: 1600,
                                height: 900,
                            }}
                        >
                            <Player
                                ref={playerRef}
                                component={MyVideoComposition}
                                inputProps={inputProps}
                                durationInFrames={durationInFrames}
                                fps={VIDEO_FPS}
                                compositionWidth={1600}
                                compositionHeight={900}
                                controls
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    backgroundColor: 'black',
                                }}
                                // frame update -> playhead
                                onFrameUpdate={(frame) => setCurrentFrame(frame)}
                            />
                            {/* Overlay: draggable text boxes */}
                            <div
                                ref={overlayRef}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    pointerEvents: 'none',
                                }}
                            >
                                {textLayers.map((l) => {
                                    const w = l.w * overlaySize.width;
                                    const h = l.h * overlaySize.height;
                                    const x = l.x * overlaySize.width;
                                    const y = l.y * overlaySize.height;

                                    const selected = l.id === selectedTextId;

                                    return (
                                        <Rnd
                                            key={l.id}
                                            bounds="parent"
                                            size={{width: w, height: h}}
                                            position={{x, y}}
                                            onDragStop={(e, d) => {
                                                updateTextFromOverlay(l.id, {
                                                    x: d.x,
                                                    y: d.y,
                                                    width: w,
                                                    height: h,
                                                });
                                            }}
                                            onResizeStop={(e, dir, ref, delta, pos) => {
                                                updateTextFromOverlay(l.id, {
                                                    x: pos.x,
                                                    y: pos.y,
                                                    width: ref.offsetWidth,
                                                    height: ref.offsetHeight,
                                                });
                                            }}
                                            onMouseDown={() => setSelectedTextId(l.id)}
                                            style={{pointerEvents: 'auto'}}
                                        >
                                            <div
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    backgroundColor: 'rgba(0,0,0,0.6)',
                                                    borderRadius: 8,
                                                    border: selected
                                                        ? '2px solid #ffdd57'
                                                        : '1px solid rgba(255,255,255,0.6)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#fff',
                                                    fontSize: 24,
                                                    padding: 8,
                                                    textAlign: 'center',
                                                    boxSizing: 'border-box',
                                                    cursor: 'move',
                                                }}
                                            >
                                                {l.text}
                                            </div>
                                        </Rnd>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{
                                width: 1600,
                                height: 900,
                                borderRadius: 8,
                                border: '2px dashed #ddd',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#999',
                            }}
                        >
                            Önce Video Upload et
                        </div>
                    )}

                    <div
                        style={{
                            fontSize: 12,
                            color: '#666',
                            marginTop: 4,
                        }}
                    >
                        Süre: {durationSec.toFixed(2)}s ({durationInFrames} frame)
                    </div>
                </div>

                {/* SAĞ: sadece küçük kontroller (audio + url opsiyonel) */}
                <div
                    style={{
                        width: 280,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}
                >
                    <h3 style={{margin: 0}}>Video URL (opsiyonel)</h3>
                    <input
                        type="text"
                        value={mainUrl}
                        onChange={(e) => setMainUrl(e.target.value)}
                        placeholder="https://..."
                        style={{width: '100%'}}
                    />

                    <hr/>

                    <h3 style={{margin: 0}}>Audio</h3>
                    <input
                        type="file"
                        accept="audio/*"
                        onChange={handleAddAudioFile}
                    />
                </div>
            </div>

            {/* ALT: TIMELINE (yaklaşık 170px) */}
            <div
                style={{
                    borderTop: '1px solid #ddd',
                    padding: '8px 16px 16px',
                    backgroundColor: '#fafafa',
                    height: 170,
                    boxSizing: 'border-box',
                }}
            >
                <div
                    style={{
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
          <span style={{fontSize: 12, color: '#555'}}>
            Timeline ({durationSec.toFixed(2)}s)
          </span>
                    <button
                        onClick={openTextModal}
                        style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: 'none',
                            backgroundColor: '#10b981',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 12,
                        }}
                    >
                        + Text
                    </button>
                </div>

                {/* Timeline container (playhead burada) */}
                <div ref={timelineRef}
                     onMouseDown={handleTimelineClick}
                     style={{position: 'relative', height: 170, width: '100%', cursor: 'pointer'}}>

                    {/* 10s markers */}
                    {renderTimelineScale()}

                    {/* Text Track */}
                    {renderTextTrack()}

                    {/* Audio Track */}
                    {renderAudioTrack()}

                    {/* PLAYHEAD LINE */}
                    <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: playheadX, width: 2, background: '#FF3A3A'
                    }}/>
                    <div style={{
                        position:'absolute',
                        left:playheadX-20,
                        top:-25,
                        padding:'2px 6px',
                        background:'black',
                        color:'white',
                        fontSize:10,
                        borderRadius:4,
                        display: playheadDragging ? 'block':'none'
                    }}>
                        {currentSec.toFixed(2)}s
                    </div>
                    {/* Bubble showing current time while dragging */}
                    <div style={{
                        position: 'absolute', left: playheadX - 20, top: -30,
                        background: '#000', color: '#fff', padding: '3px 6px', fontSize: 11,
                        borderRadius: 4, display: playheadDragging ? 'block' : 'none'
                    }}>{currentSec.toFixed(2)}s
                    </div>

                    {/* Drag Handle */}
                    <div onMouseDown={handlePlayheadMouseDown}
                         style={{
                             position: 'absolute', left: playheadX - 6, bottom: 0, width: 12, height: 12,
                             background: '#FF3A3A', borderRadius: '50%', cursor: 'ew-resize'
                         }}/>
                </div>
            </div>

            {/* TEXT MODAL */}
            {isTextModalOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 999,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: 'white',
                            padding: 16,
                            borderRadius: 8,
                            width: 320,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <h3 style={{margin: 0}}>Yeni Text</h3>
                        <input
                            type="text"
                            value={newTextValue}
                            onChange={(e) => setNewTextValue(e.target.value)}
                            placeholder="Yazıyı gir..."
                            style={{width: '100%'}}
                        />
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 8,
                                marginTop: 8,
                            }}
                        >
                            <button
                                onClick={() => setIsTextModalOpen(false)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #ddd',
                                    backgroundColor: 'white',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                }}
                            >
                                İptal
                            </button>
                            <button
                                onClick={confirmNewText}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: 'none',
                                    backgroundColor: '#2563eb',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                }}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoEditor;
