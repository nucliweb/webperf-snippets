import { useState } from 'react'
import { CldVideoPlayer } from 'next-cloudinary'

export function LazyVideoPlayer({ src, width, height, poster }) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return <CldVideoPlayer width={width} height={height} src={src} autoPlay="always" />
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
          ▶
        </div>
      </div>
    </div>
  )
}
