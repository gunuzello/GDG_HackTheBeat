import { useEffect, useState } from 'react'
import { getHealth } from './api/health.js'

function App() {
  const [status, setStatus] = useState({ state: 'loading', message: '연결 확인 중...' })

  useEffect(() => {
    getHealth()
      .then((health) => setStatus({ state: 'online', message: health.message }))
      .catch((error) => {
        console.error(error)
        setStatus({ state: 'offline', message: '백엔드 연결 실패' })
      })
  }, [])

  return (
    <main className="hero">
      <p className="eyebrow">Google I/O Extended · 2026</p>
      <h1>Hack the <span>Beat</span></h1>
      <p className="subtitle">아이디어가 정해지면 이 화면부터 우리의 제품으로 바꿉니다.</p>

      <section className="status-card" aria-live="polite">
        <div className={`status-dot ${status.state}`} />
        <div>
          <p className="status-label">Backend status</p>
          <strong>{status.message}</strong>
        </div>
      </section>
    </main>
  )
}

export default App
