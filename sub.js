export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const videoId = (url.searchParams.get("v") || "").trim();

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return new Response(JSON.stringify({ error: "Некорректный videoId" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    try {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
      const htmlRes = await fetch(watchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!htmlRes.ok) {
        throw new Error(`Не удалось открыть страницу видео (HTTP ${htmlRes.status})`);
      }

      const html = await htmlRes.text();
      const match = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
      if (!match) {
        throw new Error("Блок субтитров не найден (возможно, у видео отключены субтитры или требуется авторизация)");
      }

      const captionsObj = JSON.parse(match[1]);
      const tracks =
        captionsObj?.playerCaptionsTracklistRenderer?.captionTracks || [];

      if (!tracks.length) {
        throw new Error("У этого видео нет доступных дорожек субтитров");
      }

      // Выбираем английскую дорожку (вручную или автосубтитры), иначе первую доступную
      const chosenTrack =
        tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
        tracks.find((t) => t.languageCode && t.languageCode.startsWith("en")) ||
        tracks[0];

      const captionUrl = new URL(chosenTrack.baseUrl);
      captionUrl.searchParams.set("fmt", "json3");

      const capRes = await fetch(captionUrl.toString());
      if (!capRes.ok) {
        throw new Error(`Не удалось скачать файл субтитров (HTTP ${capRes.status})`);
      }

      const capJson = await capRes.json();
      const events = Array.isArray(capJson.events) ? capJson.events : [];

      const rawCues = [];
      for (const ev of events) {
        if (!Array.isArray(ev.segs)) continue;
        const text = ev.segs
          .map((s) => s.utf8 || "")
          .join("")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (!text || text === "[Music]" || text === "[Applause]") continue;

        const startSec = Number(((ev.tStartMs || 0) / 1000).toFixed(2));
        const durSec = Number(((ev.dDurationMs || 2000) / 1000).toFixed(2));
        rawCues.push({
          start: startSec,
          end: Number((startSec + durSec).toFixed(2)),
          en: text
        });
      }

      const sentences = mergeIntoSentences(rawCues);

      // Переводим предложения на русский
      for (const item of sentences) {
        item.ru = await translateEnToRu(item.en);
      }

      return new Response(
        JSON.stringify({
          videoId,
          lang: chosenTrack.languageCode || "en",
          sentences
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err.message || "Ошибка при получении субтитров"
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};

function mergeIntoSentences(cues) {
  const out = [];
  let parts = [];
  let start = null;
  let end = null;

  const flush = () => {
    const en = parts.join(" ").replace(/\s+/g, " ").trim();
    if (en && start !== null && end !== null) {
      out.push({
        start: Number(start.toFixed(2)),
        end: Number(Math.max(end, start + 0.5).toFixed(2)),
        en,
        ru: ""
      });
    }
    parts = [];
    start = null;
    end = null;
  };

  for (const c of cues) {
    if (start === null) start = c.start;
    if (end !== null && c.start - end > 2.2 && parts.length > 0) {
      flush();
      start = c.start;
    }
    parts.push(c.en);
    end = c.end;

    if (/[.!?]["')\]]*$/.test(c.en)) {
      flush();
    }
  }

  if (parts.length > 0) flush();
  return out;
}

async function translateEnToRu(text) {
  try {
    const u = new URL("https://translate.googleapis.com/translate_a/single");
    u.searchParams.set("client", "gtx");
    u.searchParams.set("sl", "en");
    u.searchParams.set("tl", "ru");
    u.searchParams.set("dt", "t");
    u.searchParams.set("q", text);

    const res = await fetch(u.toString());
    if (!res.ok) return "";
    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
    return data[0].map((chunk) => (Array.isArray(chunk) ? chunk[0] : "")).join("").trim();
  } catch (_) {
    return "";
  }
}