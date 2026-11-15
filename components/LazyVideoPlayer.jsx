"use client";

import { useEffect, useRef, useState } from 'react'

const CLOUD_NAME = 'nucliweb'
const VIDEO_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload`
// The poster is a frame of the video, which Cloudinary scales to each width and serves in the format
// the browser takes. The page shows it in a column of 672px at most, at up to two pixels per point
const POSTER_WIDTHS = [480, 768, 1344]
const POSTER_SIZES = '(min-width: 768px) 672px, 100vw'
const posterUrl = (src, width) => `${VIDEO_BASE}/so_auto,f_auto,q_auto,c_scale,w_${width}/${src}.jpg`

// A video that loads when the visitor asks for it. Until then it is a button with the poster: a
// button takes the focus and the Enter and Space keys, and `title` gives it its name
export function LazyVideoPlayer({ src, width, height, title }) {
  const [playing, setPlaying] = useState(false)
  const video = useRef(null)

  // The button that had the focus is gone: the video takes it, so the keyboard stays where it was
  useEffect(() => {
    if (playing) video.current?.focus()
  }, [playing])

  if (playing) {
    return (
      <video
        ref={video}
        width={width}
        height={height}
        src={`${VIDEO_BASE}/f_auto,q_auto/${src}`}
        aria-label={title}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        controls
        autoPlay
        playsInline
      />
    )
  }

  return (
    <button
      type="button"
      aria-label={`Play video: ${title}`}
      className="wp-video-poster"
      onClick={() => setPlaying(true)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img
        src={posterUrl(src, POSTER_WIDTHS[1])}
        srcSet={POSTER_WIDTHS.map((w) => `${posterUrl(src, w)} ${w}w`).join(', ')}
        sizes={POSTER_SIZES}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      <span className="wp-video-play">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  )
}
