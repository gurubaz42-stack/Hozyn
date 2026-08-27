import { useEffect, useRef, useState } from 'react'

// Start camera request immediately at module load — don't wait for React to mount
const streamPromise = navigator.mediaDevices?.getUserMedia({
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
})

export default function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    channelRef.current = new BroadcastChannel('guest_photo_channel')
    streamPromise
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().then(() => setReady(true)).catch(() => setReady(true))
        } else {
          setReady(true)
        }
      })
      .catch(e => setErr('Camera error: ' + e.message))
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      channelRef.current?.close()
    }
  }, [])

  // Assign stream to video once both are available
  useEffect(() => {
    if (videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  })

  const capture = () => {
    const v = videoRef.current
    if (!v) return
    const w = v.videoWidth || 640
    const h = v.videoHeight || 480
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(v, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    streamRef.current?.getTracks().forEach(t => t.stop())
    channelRef.current?.postMessage({ type: 'GUEST_PHOTO_CAPTURED', dataUrl })
    window.close()
  }

  return (
    <div style={{ fontFamily: 'sans-serif', background: '#0D1F40', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
      <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 16, margin: 0 }}>📷 Guest Photo Capture</p>
      <video ref={videoRef} autoPlay playsInline muted
        style={{ borderRadius: 12, border: `3px solid ${ready ? '#10B981' : '#3B82F6'}`, width: '100%', maxWidth: 460, background: '#000', display: 'block', transition: 'border-color 0.3s' }} />
      {err && <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>⚠️ {err}</p>}
      {!err && !ready && (
        <p style={{ color: '#94A3B8', fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#3B82F6', animation: 'pulse 1s infinite' }} />
          Starting camera…
        </p>
      )}
      {ready && <p style={{ color: '#10B981', fontSize: 13, fontWeight: 600, margin: 0 }}>✓ Camera ready — click Capture</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={capture} disabled={!ready}
          style={{ padding: '11px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed', background: ready ? '#10B981' : '#334155', color: 'white', transition: 'background 0.3s' }}>
          📸 Capture
        </button>
        <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); window.close() }}
          style={{ padding: '11px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#334155', color: '#94A3B8' }}>
          ✕ Cancel
        </button>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
