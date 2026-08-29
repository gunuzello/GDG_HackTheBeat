import { useEffect, useRef, useState } from 'react'
import { Client } from '@stomp/stompjs'

const HOST = window.location.hostname
const API = import.meta.env.VITE_API_URL || `http://${HOST}:8081`
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${HOST}:8081/ws`

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
      <button className="fab-static" onClick={() => {
        if (!nickname.trim()) { alert('닉네임을 입력해주세요'); return }
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
      },
    })
    client.activate()
    return () => client.deactivate()
  }, [])

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
  const createBranch = async (name, url) => {
    const videoId = extractVideoId(url)
    if (!name || !videoId) { alert('브랜치 이름과 유튜브 링크를 확인해주세요'); return false }
    const res = await fetch(`${API}/rooms/${room.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, youtubeVideoId: videoId }),
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
      roomName={room?.name} profile={profile} onLeave={leave} onSwitch={switchTo} />
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
  const shareUrl = `${window.location.origin}?room=${room.id}`
  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl)
      .then(() => alert('초대 링크가 복사됐어요!'))
      .catch(() => prompt('링크를 복사하세요:', shareUrl))
  }
  const subs = channels.filter(c => !c.isMain)
  const total = channels.reduce((s, c) => s + c.listenerCount, 0)

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
      <div className="canvas-wrap">
        <TreeSvg channels={channels} offset={offset} onJoin={onJoin} />
      </div>
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
  // 나무가 "자라는" 것을 보여주기 위한 리렌더 타이머
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 2000)
    return () => clearInterval(t)
  }, [])

  const main = channels.find(c => c.isMain)
  const subs = channels.filter(c => !c.isMain)
  const now = Date.now() + offset
  const TY = 240
  const trunkW = main ? Math.min(16 + main.listenerCount * 2, 34) : 16

  // 자라남: 파티룸이 열린 뒤 흐른 시간만큼 트렁크가 오른쪽으로 자람 (곡이 바뀌어도 리셋 안 됨, 최대 10분)
  const mainBirth = main ? (main.createdAt ?? main.startedAt) : 0
  const mainElapsed = main ? Math.min((now - mainBirth) / 1000, 600) : 0
  const trunkTip = 300 + mainElapsed * 1.8

  // 각 브랜치는 "생성된 시점의 트렁크 끝"에서 갈라져 나옴
  const geo = subs.map((ch, i) => {
    const side = i % 2 === 0 ? 1 : -1
    const birth = ch.createdAt ?? ch.startedAt
    const forkElapsed = Math.min(Math.max((birth - mainBirth) / 1000, 0), 600)
    const branchX = 300 + forkElapsed * 1.8
    // 브랜치도 생성된 뒤 흐른 시간만큼 자람
    const bElapsed = Math.min((now - birth) / 1000, 300)
    const bLen = 60 + bElapsed * 0.75
    const endX = branchX + 55 + bLen * 0.4
    const endY = TY + side * Math.min(65 + bLen * 0.5, 200)
    return { ch, side, branchX, endX, endY }
  })
  const maxEndX = geo.reduce((m, g) => Math.max(m, g.endX), 0)
  const W = Math.max(700, trunkTip + 150, maxEndX + 130)

  return (
    <svg viewBox={`0 0 ${W} 480`} width={W * scale} height={480 * scale}
      style={{ display: 'block', minWidth: scale === 1 ? '100%' : undefined }}>
      <defs>
        <filter id="neonGlow" filterUnits="userSpaceOnUse"
          x="-100" y="-100" width={W + 200} height="680">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {main && geo.map(({ ch, branchX, endX, endY }) => (
          <linearGradient key={ch.id} id={`grad-${ch.id}`}
            x1={branchX} y1={TY} x2={endX} y2={endY}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={main.colorHex} />
            <stop offset="100%" stopColor={ch.colorHex} />
          </linearGradient>
        ))}
      </defs>

      {main && (
        <g onClick={() => onJoin(main)} style={{ cursor: 'pointer' }}>
          {/* 왼쪽 뿌리에서 오른쪽으로, 재생 시간만큼 자라는 트렁크 */}
          <path
            d={`M 20 ${TY} C ${trunkTip * 0.36} ${TY - 14}, ${trunkTip * 0.66} ${TY + 14}, ${trunkTip} ${TY}`}
            fill="none" stroke={main.colorHex}
            strokeWidth={trunkW} strokeLinecap="round"
            filter="url(#neonGlow)" className="trunk-pulse"
            style={{ transition: 'stroke-width 0.4s ease' }} />
          <circle cx={trunkTip + 5} cy={TY} r={Math.max(12, trunkW * 0.8)}
            fill={main.colorHex} filter="url(#neonGlow)"
            style={{ transition: 'r 0.4s ease' }} />
          {currentId === main.id && (
            <circle cx={trunkTip + 5} cy={TY} r={Math.max(12, trunkW * 0.8) + 7}
              fill="none" stroke="#fff" strokeWidth="2" opacity="0.85" />
          )}
          <text x={trunkTip + 5} y={TY - 40} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">
            {main.name} · {main.listenerCount}명
          </text>
          {(main.riders || []).slice(0, 5).map((r, j) => (
            <text key={r.clientId} x={trunkTip - 30 - j * 24} y={TY - 16} fontSize="15">{r.emoji}</text>
          ))}
        </g>
      )}

      {geo.map(({ ch, side, branchX, endX, endY }) => {
        const width = Math.min(3 + ch.listenerCount * 3, 22)
        return (
          <g key={ch.id} onClick={() => onJoin(ch)} style={{ cursor: 'pointer' }}>
            {/* 생성 시점의 트렁크 위치에서 갈라져 나옴 — 분기점 표시 점 */}
            <circle cx={branchX} cy={TY} r="6" fill={main ? main.colorHex : '#fff'} />
            <path
              d={`M ${branchX} ${TY} C ${branchX + 8} ${TY + side * 55}, ${endX - 35} ${endY - side * 45}, ${endX} ${endY}`}
              fill="none" stroke={`url(#grad-${ch.id})`}
              strokeWidth={width} strokeLinecap="round"
              filter="url(#neonGlow)"
              style={{ transition: 'stroke-width 0.4s ease' }} />
            <circle cx={endX} cy={endY} r="10" fill={ch.colorHex} filter="url(#neonGlow)" />
            {currentId === ch.id && (
              <circle cx={endX} cy={endY} r="17" fill="none" stroke="#fff" strokeWidth="2" opacity="0.85" />
            )}
            <text x={endX} y={endY + (side > 0 ? 32 : -24)} textAnchor="middle" fill="#fff" fontSize="13">
              {ch.name} · {ch.listenerCount}명
            </text>
            {(ch.riders || []).slice(0, 4).map((r, j) => (
              <text key={r.clientId} x={endX - 22 - j * 22} y={endY + (side > 0 ? -14 : 24)} fontSize="14">{r.emoji}</text>
            ))}
          </g>
        )
      })}
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

function PlayerView({ channel, offset, channels, roomName, profile, onLeave, onSwitch }) {
  const playerRef = useRef(null)
  const loadedIdRef = useRef(channel.youtubeVideoId)
  const live = channels.find(c => c.id === channel.id) || channel
  const liveRef = useRef(live)
  liveRef.current = live
  const [showAdd, setShowAdd] = useState(false)
  let ownerKey = null
  try { ownerKey = localStorage.getItem(`bt_owner_${channel.id}`) } catch {}
  const isOwner = !!ownerKey
  const others = (live.riders || []).filter(r => r.clientId !== profile.clientId)

  const requestNext = () => {
    fetch(`${API}/channels/${channel.id}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromVideoId: liveRef.current.youtubeVideoId }),
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

  // 탭을 닫아도 퇴장 처리
  useEffect(() => {
    const bye = () => navigator.sendBeacon?.(`${API}/channels/${channel.id}/leave?clientId=${profile.clientId}`)
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [channel.id])

  useEffect(() => {
    let interval, fade, settleTimer, destroyed = false
    let settled = false
    loadYT().then(YT => {
      if (destroyed) return
      new YT.Player('yt-player', {
        videoId: channel.youtubeVideoId,
        playerVars: { playsinline: 1, autoplay: 1, controls: 0 },
        events: {
          onReady: (e) => {
            const p = e.target
            playerRef.current = p
            const sync = (threshold) => {
              let expected = (Date.now() + offset - liveRef.current.startedAt) / 1000
              const dur = p.getDuration()
              if (dur > 0) expected = expected % dur
              if (Math.abs(p.getCurrentTime() - expected) > threshold) p.seekTo(expected, true)
            }
            // 1) 입장 시 1회 동기화
            sync(0)
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
            // 3) 이후엔 건드리지 않되, 3초 이상 크게 어긋난 경우만 비상 복구
            //    (탭 백그라운드 스로틀·긴 버퍼링 복구용 — 정상 재생 중엔 발동 안 함)
            interval = setInterval(() => sync(3), 15000)
          },
          onStateChange: (e) => {
            if (e.data === 0) requestNext()
            // 2) 실제 재생이 시작된 직후 1회 정밀 보정
            //    (최초 seek는 버퍼링 전에 실행돼 버퍼링 시간만큼 밀리는 것을 여기서 잡음)
            if (e.data === 1 && !settled) {
              settled = true
              settleTimer = setTimeout(() => {
                const p = playerRef.current
                if (!p) return
                let expected = (Date.now() + offset - liveRef.current.startedAt) / 1000
                const dur = p.getDuration()
                if (dur > 0) expected = expected % dur
                if (Math.abs(p.getCurrentTime() - expected) > 0.4) p.seekTo(expected, true)
              }, 1200)
            }
          },
        },
      })
    })
    return () => {
      destroyed = true
      clearInterval(interval)
      clearInterval(fade)
      clearTimeout(settleTimer)
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
      <div className="mini-tree">
        <TreeSvg channels={channels.filter(c => c.roomId === channel.roomId)}
          offset={offset} onJoin={onSwitch} scale={0.55} currentId={channel.id} />
      </div>
      {others.length > 0 && (
        <div className="riders">
          {others.map(r => (
            <button key={r.clientId} className="rider" onClick={() => pokeUser(r)}
              title="콕 찌르기">
              {r.emoji} {r.nickname} <span className="poke-hint">콕</span>
            </button>
          ))}
        </div>
      )}
      {isOwner && (
        <div className="player-actions">
          <button onClick={() => setShowAdd(true)}>+ 곡 추가</button>
          <button onClick={requestNext} disabled={!live.queue?.length}
            style={{ opacity: live.queue?.length ? 1 : 0.4 }}>다음 곡 ▶</button>
        </div>
      )}
      {!isOwner && <p className="dj-note">이 브랜치의 DJ가 곡을 고르고 있어요 · 취향이 다르면 새 브랜치를 만들어보세요</p>}
      <button className="leave" onClick={onLeave}>나가기</button>
      {showAdd && (
        <Form fields={[['유튜브 링크', true]]} submitLabel="대기열에 추가"
          onSubmit={addToQueue} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}
