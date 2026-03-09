// Open-Meteo + Geocoding — API 키 불필요
export default async function handler(req, res) {
  const city = (req.query.city || '').trim() || 'Seoul';
  try {
    // 도시 → 좌표
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ko`,
      { headers: { 'User-Agent': 'DayMate/1.0' } }
    );
    const gj = await geo.json();
    const loc = gj.results?.[0];
    if (!loc) return res.status(200).json({ ok: false });

    // 날씨 조회
    const wx = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weathercode,windspeed_10m&timezone=auto`,
      { headers: { 'User-Agent': 'DayMate/1.0' } }
    );
    const wj = await wx.json();
    const c = wj.current;

    const WX_DESC = {
      0:'맑음',1:'주로 맑음',2:'구름 조금',3:'흐림',
      45:'안개',48:'서리 안개',51:'가랑비',53:'보통 비',55:'강한 비',
      61:'약한 비',63:'보통 비',65:'강한 비',
      71:'약한 눈',73:'보통 눈',75:'강한 눈',
      80:'소나기',81:'강한 소나기',82:'폭우',
      95:'뇌우',96:'우박 뇌우',99:'강한 우박 뇌우',
    };
    const WX_ICON = {
      0:'☀️',1:'🌤',2:'⛅',3:'☁️',
      45:'🌫',48:'🌫',51:'🌦',53:'🌧',55:'🌧',
      61:'🌧',63:'🌧',65:'🌧',
      71:'🌨',73:'🌨',75:'❄️',
      80:'🌦',81:'🌧',82:'⛈',
      95:'⛈',96:'⛈',99:'⛈',
    };
    const code = c.weathercode;
    res.status(200).json({
      ok: true,
      city: loc.name,
      temp: Math.round(c.temperature_2m),
      desc: WX_DESC[code] || '날씨 정보',
      icon: WX_ICON[code] || '🌡️',
      wind: Math.round(c.windspeed_10m),
    });
  } catch {
    res.status(200).json({ ok: false });
  }
}
