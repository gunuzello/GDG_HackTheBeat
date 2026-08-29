import { getHealth } from './api.js';

const statusDot = document.querySelector('#status-dot');
const statusText = document.querySelector('#status-text');

try {
    const health = await getHealth();
    statusDot.classList.add('online');
    statusText.textContent = health.message;
} catch (error) {
    statusDot.classList.add('offline');
    statusText.textContent = '백엔드 연결 실패';
    console.error(error);
}
