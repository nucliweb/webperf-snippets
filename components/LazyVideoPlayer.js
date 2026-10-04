"use client";

import { useState } from 'react'
const CLOUD_NAME = 'nucliweb'

export function LazyVideoPlayer({ src, width, height, poster }) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <video
        width={width}
        height={height}
        src={`https://res.cloudinary.com/${CLOUD_NAME}/video/upload/f_auto,q_auto/${src}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        controls
        autoPlay
        playsInline
      />
    )
  }

  return (
    <div
      onClick={() => setPlaying(true)}
      style={{
        position: 'relative',
        cursor: 'pointer',
        background: '#000',
        aspectRatio: `${width} / ${height}`,
        overflow: 'hidden',
      }}
    >
      {poster && (
        <img
          src={poster}
          alt="Video tutorial preview"
          width={width}
          height={height}
          loading="lazy"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'rgba(0, 0, 0, 0.65)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            color: '#fff',
            userSelect: 'none',
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}
