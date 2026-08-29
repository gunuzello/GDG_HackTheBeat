import { useEffect, useRef, useState } from 'react'
import { Client } from '@stomp/stompjs'

const HOST = window.location.hostname
const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? `http://${HOST}:8080` : '')
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL = import.meta.env.VITE_WS_URL || (import.meta.env.DEV
  ? `ws://${HOST}:8080/ws`
  : `${WS_PROTOCOL}://${window.location.host}/ws`)

let ytReady = null
function loadYT() {
  if (ytReady) return ytReady
  ytReady = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return ytReady
}

function extractVideoId(input) {
  const m = input.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)
  if (m) return m[1]
  if (/^[\w-]{11}$/.test(input.trim())) return input.trim()
  return null
}

// 헤드폰 노크음 (콕 찌르기 수신)
function playKnock() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.18].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 190
      o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.35, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.12)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.14)
    })
  } catch {}
}

export default function App() {
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bt_profile')) } catch { return null }
  })
  if (!profile) {
    return <Onboarding onDone={(p) => {
      try { localStorage.setItem('bt_profile', JSON.stringify(p)) } catch {}
      setProfile(p)
    }} />
  }
  return <Main profile={profile} />
}

const EMOJIS = ['🎧', '🔥', '🪩', '⚡', '💃', '🕺', '🌙', '🍸', '🎷', '🌈', '😎', '🖤']

function Onboarding({ onDone }) {
  const [nickname, setNickname] = useState('')
  const [emoji, setEmoji] = useState('🎧')
  const [headphonesChecked, setHeadphonesChecked] = useState(false)
  const testHeadphones = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const play = (pan, delay) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const panner = ctx.createStereoPanner()
      oscillator.frequency.value = pan < 0 ? 440 : 660
      panner.pan.value = pan
      gain.gain.value = 0.15
      oscillator.connect(gain).connect(panner).connect(ctx.destination)
      oscillator.start(ctx.currentTime + delay)
      oscillator.stop(ctx.currentTime + delay + 0.35)
    }
    play(-1, 0)
    play(1, 0.5)
    setHeadphonesChecked(true)
  }
  return (
    <div className="onboard">
      <h1 className="logo">BEATTREE</h1>
      <p className="tagline">파티에서 뭐라고 불릴까요?</p>
      <input className="nick-input" placeholder="닉네임" value={nickname} maxLength={10}
        onChange={e => setNickname(e.target.value)} />
      <div className="emoji-grid">
        {EMOJIS.map(em => (
          <button key={em} className={em === emoji ? 'sel' : ''}
            onClick={() => setEmoji(em)}>{em}</button>
        ))}
      </div>
      <button className="headphone-test" onClick={testHeadphones}>
        {headphonesChecked ? '✓ 이어폰 좌우 확인 완료' : '🎧 이어폰 좌우 테스트'}
      </button>
      <button className="fab-static" onClick={() => {
        if (!nickname.trim()) { alert('닉네임을 입력해주세요'); return }
        if (!headphonesChecked) { alert('이어폰 테스트를 먼저 해주세요'); return }
        const clientId = (crypto.randomUUID?.() || Math.random().toString(36).slice(2))
        onDone({ clientId, nickname: nickname.trim(), emoji })
      }}>파티 입장 🎉</button>
    </div>
  )
}

function Main({ profile }) {
  const [rooms, setRooms] = useState([])
  const [channels, setChannels] = useState([])
  const [room, setRoom] = useState(null)
  const [joined, setJoined] = useState(null)
  const [offset, setOffset] = useState(0)
  const [poke, setPoke] = useState(null)
  const [signal, setSignal] = useState(null)
  const [pendingRoom, setPendingRoom] = useState(
    () => new URLSearchParams(window.location.search).get('room'))

  const enterRoom = (r) => {
    try { localStorage.setItem('bt_last_room', JSON.stringify({ id: r.id, name: r.name })) } catch {}
    setRoom(r)
  }

  // 초대 링크(?room=id)로 들어오면 해당 파티룸으로 바로 입장
  useEffect(() => {
    if (pendingRoom && rooms.length && !room) {
      const r = rooms.find(x => x.id === pendingRoom)
      if (r) enterRoom(r)
      setPendingRoom(null)
    }
  }, [rooms])

  useEffect(() => {
    fetch(`${API}/api/time`).then(r => r.json())
      .then(d => setOffset(d.serverTimeMillis - Date.now()))
    fetch(`${API}/rooms`).then(r => r.json()).then(setRooms)
    fetch(`${API}/channels`).then(r => r.json()).then(setChannels)

    const client = new Client({
      brokerURL: WS_URL,
      reconnectDelay: 2000,
      onConnect: () => {
        client.subscribe('/topic/channels', msg => setChannels(JSON.parse(msg.body)))
        client.subscribe('/topic/rooms', msg => setRooms(JSON.parse(msg.body)))
        client.subscribe(`/topic/poke/${profile.clientId}`, msg => {
          const data = JSON.parse(msg.body)
          playKnock()
          setPoke(data)
          setTimeout(() => setPoke(null), 3500)
        })
        client.subscribe(`/topic/signal/${profile.clientId}`, msg => setSignal(JSON.parse(msg.body)))
      },
    })
    client.activate()
    return () => client.deactivate()
  }, [])

  useEffect(() => {
    if (!joined) return
    const heartbeat = setInterval(() => {
      fetch(`${API}/channels/${joined.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
    }, 15000)
    return () => clearInterval(heartbeat)
  }, [joined?.id])

  const join = async (ch) => {
    await fetch(`${API}/channels/${ch.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    setJoined(ch)
  }
  const leave = async () => {
    if (joined) fetch(`${API}/channels/${joined.id}/leave?clientId=${profile.clientId}`, { method: 'POST' })
    setJoined(null)
  }
  const createBranch = async (name, url, parentChannelId = null) => {
    const videoId = extractVideoId(url)
    if (!name || !videoId) { alert('브랜치 이름과 유튜브 링크를 확인해주세요'); return false }
    const res = await fetch(`${API}/rooms/${room.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, youtubeVideoId: videoId, parentChannelId }),
    })
    const { channel, ownerKey } = await res.json()
    try { localStorage.setItem(`bt_owner_${channel.id}`, ownerKey) } catch {}
    join(channel)
    return true
  }
  const createRoom = async (name, url) => {
    if (!name) { alert('파티룸 이름을 입력해주세요'); return false }
    const body = { name }
    if (url) {
      const videoId = extractVideoId(url)
      if (!videoId) { alert('유튜브 링크를 확인해주세요'); return false }
      body.youtubeVideoId = videoId
    }
    const res = await fetch(`${API}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    try { localStorage.setItem(`bt_owner_${data.mainChannelId}`, data.ownerKey) } catch {}
    enterRoom({ id: data.id, name: data.name })
    return true
  }

  // 플레이어 화면의 나무에서 다른 브랜치 탭 → 현재 채널 나가고 그 채널로 이동
  const switchTo = async (ch) => {
    if (joined && ch.id === joined.id) return
    if (joined) fetch(`${API}/channels/${joined.id}/leave?clientId=${profile.clientId}`, { method: 'POST' })
    join(ch)
  }

  let view
  if (joined) {
    view = <PlayerView key={joined.id} channel={joined} offset={offset} channels={channels}
      roomName={room?.name} profile={profile} onLeave={leave} onSwitch={switchTo}
      onCreateBranch={createBranch} signal={signal} />
  } else if (room) {
    view = <BranchView room={room} channels={channels.filter(c => c.roomId === room.id)}
      offset={offset} onJoin={join} onBack={() => setRoom(null)} onCreate={createBranch} />
  } else {
    view = <RoomListView rooms={rooms} onEnter={enterRoom} onCreate={createRoom} />
  }
  return (
    <>
      {view}
      {poke && (
        <div className="toast">
          {poke.fromEmoji} <b>{poke.fromNickname}</b>님이 콕 찔렀어요 — 이 곡 취향 저격이죠?
        </div>
      )}
    </>
  )
}

function RoomListView({ rooms, onEnter, onCreate }) {
  const [showForm, setShowForm] = useState(false)
  let last = null
  try { last = JSON.parse(localStorage.getItem('bt_last_room')) } catch {}
  const lastRoom = last && rooms.find(r => r.id === last.id)
  return (
    <div className="screen">
      <h1 className="logo">BEATTREE</h1>
      <p className="tagline">지금 가장 핫한 무소음 파티룸</p>
      {lastRoom && (
        <button className="resume-banner" onClick={() => onEnter(lastRoom)}>
          🎧 지난 파티 <b>{lastRoom.name}</b> 이어 듣기 ›
        </button>
      )}
      <div className="room-list">
        {rooms.map((r, i) => (
          <div key={r.id} className={`room-card ${i === 0 ? 'top' : ''}`}
            style={{ '--accent': r.colorHex }}
            onClick={() => onEnter(r)}>
            <span className="rank">{i + 1}위</span>
            <div className="room-info">
              <span className="room-name">{r.name}</span>
              <span className="room-meta">브랜치 {r.channelCount}개 · {r.listenerCount}명 듣는 중</span>
            </div>
            <span className="enter">입장 ›</span>
          </div>
        ))}
        {rooms.length === 0 && <p className="empty">아직 파티룸이 없어요</p>}
      </div>
      {showForm ? (
        <Form fields={[['파티룸 이름', true], ['DJ 유튜브 링크 (비우면 기본곡)', false]]}
          submitLabel="파티룸 열기"
          onSubmit={onCreate} onClose={() => setShowForm(false)} />
      ) : (
        <button className="fab" onClick={() => setShowForm(true)}>+ 파티룸 만들기</button>
      )}
    </div>
  )
}

function BranchView({ room, channels, offset, onJoin, onBack, onCreate }) {
  const [showForm, setShowForm] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [followLive, setFollowLive] = useState(true)
  const canvasRef = useRef(null)
  const shareUrl = `${window.location.origin}?room=${room.id}`
  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl)
      .then(() => alert('초대 링크가 복사됐어요!'))
      .catch(() => prompt('링크를 복사하세요:', shareUrl))
  }
  const subs = channels.filter(c => !c.isMain)
  const total = channels.reduce((s, c) => s + c.listenerCount, 0)
  const hottest = [...channels].sort((a, b) => b.listenerCount - a.listenerCount)[0]

  useEffect(() => {
    if (!followLive) return
    const timer = setInterval(() => {
      const canvas = canvasRef.current
      if (canvas) canvas.scrollLeft = canvas.scrollWidth - canvas.clientWidth
    }, 120)
    return () => clearInterval(timer)
  }, [followLive])

  return (
    <div className="screen">
      <header className="room-header">
        <button className="back" onClick={onBack}>‹</button>
        <div style={{ flex: 1 }}>
          <h2>{room.name}</h2>
          <p className="room-meta">{total}명이 듣는 중 · 브랜치 {subs.length}개</p>
        </div>
        <button className="invite-btn" onClick={() => setShowInvite(true)}>친구 초대</button>
      </header>
      {showInvite && (
        <div className="form-sheet invite-sheet">
          <p className="invite-title">QR을 보여주거나 링크를 보내세요</p>
          <img className="qr" alt="초대 QR"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`} />
          <div className="form-row">
            <button onClick={copyLink}>링크 복사</button>
            <button className="ghost" onClick={() => setShowInvite(false)}>닫기</button>
          </div>
        </div>
      )}
      <div className="canvas-wrap" ref={canvasRef}
        onPointerDown={() => setFollowLive(false)}
        onWheel={() => setFollowLive(false)}>
        <TreeSvg channels={channels} offset={offset} onJoin={onJoin} />
      </div>
      {!followLive && (
        <button className="follow-live" onClick={() => setFollowLive(true)}>현재 머리로 →</button>
      )}
      {hottest && (
        <button className="hot-jump" onClick={() => onJoin(hottest)}>
          🔥 가장 핫한 가지로 점프 · {hottest.listenerCount}명
        </button>
      )}
      {showForm ? (
        <Form fields={[['브랜치 이름', true], ['유튜브 링크', true]]}
          submitLabel="브랜치 만들기"
          onSubmit={onCreate} onClose={() => setShowForm(false)} />
      ) : (
        <button className="fab" onClick={() => setShowForm(true)}>+ 새 브랜치 만들기</button>
      )}
    </div>
  )
}

// 브랜치 화면과 플레이어 화면에서 공용으로 쓰는 나무 시각화
function TreeSvg({ channels, offset, onJoin, scale = 1, currentId = null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 120)
    return () => clearInterval(t)
  }, [])

  const main = channels.find(c => c.isMain)
  const subs = channels.filter(c => !c.isMain)
  const now = Date.now() + offset
  if (!main) return null

  const nodes = new Map()
  const children = new Map()
  const growthLength = (channel, elapsed) => channel.isMain
    ? Math.max(180, elapsed * 5)
    : Math.max(100, elapsed * 4)
  subs.forEach(ch => children.set(ch.parentId, [...(children.get(ch.parentId) || []), ch]))
  const mainElapsed = Math.max(0, (now - main.startedAt) / 1000)
  const mainLength = growthLength(main, mainElapsed)
  nodes.set(main.id, { x1: 35, y1: 260, x2: 35 + mainLength, y2: 260,
    angle: 0, depth: 0, length: mainLength, bendLength: 0 })

  const pointAt = (node, distance) => {
    const d = Math.min(distance, node.length)
    const bend = Math.min(d, node.bendLength)
    return {
      x: node.x1 + Math.cos(node.angle) * bend + Math.max(0, d - node.bendLength),
      y: node.y1 + Math.sin(node.angle) * bend,
    }
  }

  const layoutChildren = (parent) => {
    const parentNode = nodes.get(parent.id)
    const list = children.get(parent.id) || []
    list.forEach((ch, index) => {
      const splitDistance = Math.min(
        growthLength(parent, ch.parentElapsedSecondsAtCreation),
        Math.hypot(parentNode.x2 - parentNode.x1, parentNode.y2 - parentNode.y1),
      )
      const splitPoint = pointAt(parentNode, splitDistance)
      const x1 = splitPoint.x
      const y1 = splitPoint.y
      const direction = index % 2 === 0 ? -1 : 1
      const angle = parentNode.angle + direction * (0.48 + Math.floor(index / 2) * 0.16)
      const elapsed = Math.max(0, (now - ch.startedAt) / 1000)
      const length = growthLength(ch, elapsed)
      const bendLength = Math.min(115, length)
      const turnX = x1 + Math.cos(angle) * bendLength
      const turnY = y1 + Math.sin(angle) * bendLength
      nodes.set(ch.id, {
        x1, y1,
        x2: turnX + Math.max(0, length - bendLength),
        y2: turnY,
        angle,
        depth: parentNode.depth + 1,
        length,
        bendLength,
      })
      layoutChildren(ch)
    })
  }
  layoutChildren(main)
  const allNodes = [...nodes.values()]
  const W = Math.max(700, ...allNodes.map(n => n.x2 + 160))
  const minY = Math.min(0, ...allNodes.map(n => n.y2 - 80))
  const maxY = Math.max(520, ...allNodes.map(n => n.y2 + 80))
  const H = maxY - minY

  const renderChannel = (ch) => {
    const node = nodes.get(ch.id)
    const width = ch.isMain
      ? Math.min(16 + ch.listenerCount * 2, 34)
      : Math.min(4 + ch.listenerCount * 3, 22)
    const turnX = node.x1 + Math.cos(node.angle) * node.bendLength
    const turnY = node.y1 + Math.sin(node.angle) * node.bendLength
    const controlX = (node.x1 + turnX) / 2
    const controlY = node.y1 + (turnY - node.y1) * 0.72
    const path = ch.isMain
      ? `M ${node.x1} ${node.y1} L ${node.x2} ${node.y2}`
      : `M ${node.x1} ${node.y1} Q ${controlX} ${controlY} ${turnX} ${turnY} L ${node.x2} ${node.y2}`
    return (
      <g key={ch.id} onClick={() => onJoin(ch)} style={{ cursor: 'pointer' }}>
        <path d={path}
          fill="none" stroke={ch.colorHex} strokeWidth={width} strokeLinecap="round"
          filter="url(#neonGlow)" className="flow-branch" style={{ transition: 'stroke-width 0.25s ease' }} />
        <circle cx={node.x2} cy={node.y2} r={Math.max(9, width * 0.7)}
          fill={ch.colorHex} filter="url(#neonGlow)" className="growing-tip" />
        {currentId === ch.id && <circle cx={node.x2} cy={node.y2} r={Math.max(16, width)}
          fill="none" stroke="#fff" strokeWidth="2" />}
        <text x={node.x2} y={node.y2 - 24} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">
          {ch.name} · {ch.listenerCount}명
        </text>
        {(ch.riders || []).slice(0, 5).map((r, j) => (
          <text key={r.clientId} x={node.x2 - 20 - j * 22} y={node.y2 + 24} fontSize="14">{r.emoji}</text>
        ))}
      </g>
    )
  }

  return (
    <svg viewBox={`0 ${minY} ${W} ${H}`} width={W * scale} height={H * scale}
      style={{ display: 'block', minWidth: scale === 1 ? '100%' : undefined }}>
      <defs>
        <filter id="neonGlow" filterUnits="userSpaceOnUse" x="-100" y={minY - 100} width={W + 200} height={H + 200}>
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {[main, ...subs].map(renderChannel)}
    </svg>
  )
}

function Form({ fields, submitLabel, onSubmit, onClose }) {
  const [values, setValues] = useState(fields.map(() => ''))
  const submit = async () => {
    if (await onSubmit(...values)) onClose()
  }
  return (
    <div className="form-sheet">
      {fields.map(([placeholder], i) => (
        <input key={i} placeholder={placeholder} value={values[i]}
          onChange={e => setValues(v => v.map((x, j) => j === i ? e.target.value : x))} />
      ))}
      <div className="form-row">
        <button onClick={submit}>{submitLabel}</button>
        <button className="ghost" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}

function PlayerView({ channel, offset, channels, roomName, profile, onLeave, onSwitch, onCreateBranch, signal }) {
  const playerRef = useRef(null)
  const miniTreeRef = useRef(null)
  const loadedIdRef = useRef(channel.youtubeVideoId)
  const live = channels.find(c => c.id === channel.id) || channel
  const liveRef = useRef(live)
  liveRef.current = live
  const [showAdd, setShowAdd] = useState(false)
  const [showBranch, setShowBranch] = useState(false)
  const [speakingTo, setSpeakingTo] = useState(null)
  const peerRef = useRef(null)
  const streamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  let ownerKey = null
  try { ownerKey = localStorage.getItem(`bt_owner_${channel.id}`) } catch {}
  const isOwner = !!ownerKey
  const others = (live.riders || []).filter(r => r.clientId !== profile.clientId)

  useEffect(() => {
    const timer = setInterval(() => {
      const tree = miniTreeRef.current
      if (tree) tree.scrollLeft = tree.scrollWidth - tree.clientWidth
    }, 120)
    return () => clearInterval(timer)
  }, [])

  const requestNext = () => {
    fetch(`${API}/channels/${channel.id}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromVideoId: liveRef.current.youtubeVideoId, ownerKey }),
    })
  }
  const addToQueue = async (url) => {
    const videoId = extractVideoId(url)
    if (!videoId) { alert('유튜브 링크를 확인해주세요'); return false }
    await fetch(`${API}/channels/${channel.id}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubeVideoId: videoId, ownerKey }),
    })
    return true
  }
  const pokeUser = (r) => {
    fetch(`${API}/poke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toClientId: r.clientId, fromNickname: profile.nickname, fromEmoji: profile.emoji }),
    })
  }
  const sendSignal = (toClientId, payload) => fetch(`${API}/signal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, toClientId, fromClientId: profile.clientId,
      fromNickname: profile.nickname, fromEmoji: profile.emoji }),
  })
  const makePeer = (targetId) => {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    peer.onicecandidate = e => e.candidate && sendSignal(targetId, { type: 'candidate', candidate: e.candidate })
    peer.ontrack = e => {
      remoteAudioRef.current.srcObject = e.streams[0]
      remoteAudioRef.current.play().catch(() => {})
    }
    peerRef.current = peer
    return peer
  }
  const startWhisper = async (r) => {
    if (speakingTo) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const peer = makePeer(r.clientId)
      stream.getTracks().forEach(track => peer.addTrack(track, stream))
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await sendSignal(r.clientId, { type: 'offer', sdp: offer })
      setSpeakingTo(r.clientId)
      playerRef.current?.setVolume?.(35)
    } catch { alert('마이크 권한이 필요합니다') }
  }
  const stopWhisper = (targetId = speakingTo) => {
    if (targetId) sendSignal(targetId, { type: 'hangup' })
    streamRef.current?.getTracks().forEach(track => track.stop())
    peerRef.current?.close()
    streamRef.current = null
    peerRef.current = null
    setSpeakingTo(null)
    playerRef.current?.setVolume?.(100)
  }

  useEffect(() => {
    if (!signal) return
    const handle = async () => {
      if (signal.type === 'offer') {
        peerRef.current?.close()
        const peer = makePeer(signal.fromClientId)
        await peer.setRemoteDescription(signal.sdp)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        await sendSignal(signal.fromClientId, { type: 'answer', sdp: answer })
        playerRef.current?.setVolume?.(35)
      } else if (signal.type === 'answer' && peerRef.current) {
        await peerRef.current.setRemoteDescription(signal.sdp)
      } else if (signal.type === 'candidate' && peerRef.current) {
        await peerRef.current.addIceCandidate(signal.candidate).catch(() => {})
      } else if (signal.type === 'hangup') {
        peerRef.current?.close(); peerRef.current = null
        remoteAudioRef.current.srcObject = null
        playerRef.current?.setVolume?.(100)
      }
    }
    handle().catch(console.error)
  }, [signal])

  useEffect(() => () => stopWhisper(), [])

  // 탭을 닫아도 퇴장 처리
  useEffect(() => {
    const bye = () => navigator.sendBeacon?.(`${API}/channels/${channel.id}/leave?clientId=${profile.clientId}`)
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [channel.id])

  useEffect(() => {
    let interval, fade, destroyed = false
    loadYT().then(YT => {
      if (destroyed) return
      new YT.Player('yt-player', {
        videoId: channel.youtubeVideoId,
        playerVars: { playsinline: 1, autoplay: 1, controls: 0 },
        events: {
          onReady: (e) => {
            const p = e.target
            playerRef.current = p
            const sync = () => {
              let expected = (Date.now() + offset - liveRef.current.startedAt) / 1000
              const dur = p.getDuration()
              if (dur > 0) expected = expected % dur
              if (Math.abs(p.getCurrentTime() - expected) > 0.75) p.seekTo(expected, true)
            }
            sync()
            // 페이드인 입장 (크로스페이드 라이트)
            try {
              p.setVolume(0)
              let v = 0
              fade = setInterval(() => {
                v += 12
                p.setVolume(Math.min(v, 100))
                if (v >= 100) clearInterval(fade)
              }, 140)
            } catch {}
            p.playVideo()
            interval = setInterval(sync, 5000)
          },
          onStateChange: (e) => {
            if (e.data === 0) requestNext()
          },
        },
      })
    })
    return () => {
      destroyed = true
      clearInterval(interval)
      clearInterval(fade)
      if (playerRef.current) playerRef.current.destroy()
    }
  }, [channel.id])

  // 서버가 곡을 넘기면(브로드캐스트) 모두 동시에 새 곡 로드
  useEffect(() => {
    const p = playerRef.current
    if (!p) return
    if (loadedIdRef.current !== live.youtubeVideoId) {
      loadedIdRef.current = live.youtubeVideoId
      p.loadVideoById(live.youtubeVideoId)
    } else if (p.getCurrentTime) {
      const expected = (Date.now() + offset - live.startedAt) / 1000
      if (expected >= 0 && Math.abs(p.getCurrentTime() - expected) > 0.75) p.seekTo(expected, true)
    }
  }, [live.youtubeVideoId, live.startedAt])

  return (
    <div className="player-screen" style={{ '--channel-color': channel.colorHex }}>
      <div className="border-glow" />
      {roomName && <p className="room-tag">{roomName}</p>}
      <h2 style={{ color: channel.colorHex }}>{live.name}</h2>
      <p className="listeners">
        {others.length > 0
          ? `너랑 ${others.length}명이 이 순간을 듣는 중`
          : '아직 나 혼자 듣는 중'}
        {' · '}대기열 {live.queue?.length ?? 0}곡
      </p>
      <div className="yt-box"><div id="yt-player" /></div>
      {/* 이 파티룸의 나무: 탭하면 그 브랜치로 바로 이동 */}
      <div className="mini-tree" ref={miniTreeRef}>
        <TreeSvg channels={channels.filter(c => c.roomId === channel.roomId)}
          offset={offset} onJoin={onSwitch} scale={0.55} currentId={channel.id} />
      </div>
      {others.length > 0 && (
        <div className="riders">
          {others.map(r => (
            <div key={r.clientId} className="rider-wrap">
              <button className="rider" onClick={() => pokeUser(r)} title="콕 찌르기">
                {r.emoji} {r.nickname} <span className="poke-hint">콕</span>
              </button>
              <button className={`talk ${speakingTo === r.clientId ? 'active' : ''}`}
                onPointerDown={() => startWhisper(r)}
                onPointerUp={() => stopWhisper(r.clientId)}
                onPointerCancel={() => stopWhisper(r.clientId)}
                onPointerLeave={() => speakingTo === r.clientId && stopWhisper(r.clientId)}>
                {speakingTo === r.clientId ? '말하는 중…' : '꾹 눌러 말하기'}
              </button>
            </div>
          ))}
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay />
      {isOwner && (
        <div className="player-actions">
          <button onClick={() => setShowAdd(true)}>+ 곡 추가</button>
          <button onClick={requestNext} disabled={!live.queue?.length}
            style={{ opacity: live.queue?.length ? 1 : 0.4 }}>다음 곡 ▶</button>
        </div>
      )}
      <button className="branch-here" onClick={() => setShowBranch(true)}>⑂ 여기서 새 가지 만들기</button>
      {!isOwner && <p className="dj-note">이 브랜치의 DJ가 곡을 고르고 있어요 · 취향이 다르면 새 브랜치를 만들어보세요</p>}
      <button className="leave" onClick={onLeave}>나가기</button>
      {showAdd && (
        <Form fields={[['유튜브 링크', true]]} submitLabel="대기열에 추가"
          onSubmit={addToQueue} onClose={() => setShowAdd(false)} />
      )}
      {showBranch && (
        <Form fields={[['브랜치 이름', true], ['유튜브 링크', true]]} submitLabel="여기서 분기"
          onSubmit={(name, url) => onCreateBranch(name, url, channel.id)}
          onClose={() => setShowBranch(false)} />
      )}
    </div>
  )
}
