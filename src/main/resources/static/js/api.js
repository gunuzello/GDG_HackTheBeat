export async function getHealth() {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
    return response.json();
}
