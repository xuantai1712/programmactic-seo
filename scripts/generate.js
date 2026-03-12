#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { parse } = require("csv-parse/sync");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PROJECT_ROOT = path.resolve(__dirname, "..", "");
const CSV_PATH = path.join(PROJECT_ROOT, "keyword.csv");
const OUT_DIR_BASE = path.join(PROJECT_ROOT, "src", "pages");
const CACHE_DIR_BASE = path.join(PROJECT_ROOT, ".cache");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "generate.log");
const LANGUAGES = ["vi", "en"]; // Hỗ trợ Tiếng Việt và Tiếng Anh

function logLine(line) {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}\n`;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, entry);
  process.stdout.write(entry);
}

function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureDirs(lang) {
  await fsp.mkdir(path.join(OUT_DIR_BASE, lang), { recursive: true });
  await fsp.mkdir(path.join(CACHE_DIR_BASE, lang), { recursive: true });
  await fsp.mkdir(LOG_DIR, { recursive: true });
}

async function readCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("keyword.csv not found");
  }
  const text = await fsp.readFile(filePath, "utf8");
  const rows = parse(text, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: true,
    delimiter: ","
  });
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map((c) => String(c).trim());
    if (row.length !== 3 || row.some((c) => c.length === 0)) {
      logLine(`Invalid row at line ${i + 1}, skipped: ${JSON.stringify(row)}`);
      continue;
    }
    out.push({ keyword: row[0], category: row[1], intent: row[2] });
  }
  if (!out.length) {
    throw new Error("keyword.csv has no valid rows");
  }
  return out;
}

async function openaiChatJSON(systemPrompt, userPrompt) {
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  return content;
}

async function geminiChatJSON(systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemPrompt + "\n\n" + userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return content;
}

async function callWithRetry(fn, attempts = 3, baseDelayMs = 1500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = baseDelayMs * Math.pow(2, i);
      logLine(`Retry ${i + 1}/${attempts} after error: ${e.message}. Waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function buildPrompt({ keyword, category, intent }, lang) {
  const langName = lang === "vi" ? "Tiếng Việt" : "Tiếng Anh (English)";
  const system = [
    "Bạn là AI SEO writer chuyên nghiệp.",
    "Không bịa dữ liệu, không tự tạo giá/số liệu/thống kê.",
    "Nếu cần nêu số liệu, chỉ đưa nguyên tắc/khái quát không số cụ thể.",
    "Nội dung phải hữu ích, có cấu trúc, và trung lập.",
    "BẮT BUỘC: Luôn trả về dữ liệu ở định dạng JSON thô (raw JSON), không nằm trong block markdown, không có bất kỳ văn bản nào khác ngoài JSON."
  ].join(" ");
  const user = [
    `Chủ đề: ${keyword}`,
    category ? `Chuyên mục: ${category}` : "",
    intent ? `Ý định tìm kiếm: ${intent}` : "",
    `Ngôn ngữ bài viết: ${langName}`,
    "",
    "Yêu cầu:",
    `- Viết bài SEO 1200–2000 từ bằng ${langName} tự nhiên, không lặp.`,
    "- Tựa đề hấp dẫn, không clickbait.",
    "- Meta description 150–160 ký tự, rõ lợi ích.",
    "- Dùng heading H2/H3, danh sách, đoạn ngắn.",
    "- Không nêu giá, % hay số liệu cụ thể.",
    "- Không hứa hẹn/đảm bảo phi thực tế.",
    "",
    "Trả về JSON với cấu trúc:",
    "{",
    '  "title": "...",',
    '  "meta_description": "...",',
    '  "content": "..."',
    "}"
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

function injectAffiliatePlaceholder(markdown) {
  const parts = markdown.split(/\n\s*\n/);
  if (parts.length > 3) {
    parts.splice(3, 0, "<!-- AFFILIATE_PLACEHOLDER -->");
    return parts.join("\n\n");
  }
  return markdown + "\n\n<!-- AFFILIATE_PLACEHOLDER -->";
}

function toFrontMatter(data, body, lang) {
  const imageId = Math.floor(Math.random() * 1000);
  const imageUrl = `https://images.unsplash.com/photo-${1600000000000 + imageId}?auto=format&fit=crop&w=800&q=80`;
  const fm = [
    "---",
    `title: "${(data.title || "").replace(/\"/g, '\\"')}"`,
    `description: "${(data.meta_description || "").replace(/\"/g, '\\"')}"`,
    "tags: ['articles']",
    `date: ${new Date().toISOString()}`,
    `permalink: "/${lang}/${data.slug}/index.html"`,
    "layout: layouts/base.njk",
    `lang: ${lang}`,
    `image: "${imageUrl}"`,
    "---",
    "",
    body,
    ""
  ].join("\n");
  return fm;
}

async function processRecord(rec, rateDelayMs, lang) {
  const slug = slugify(rec.keyword);
  const outDir = path.join(OUT_DIR_BASE, lang);
  const cacheDir = path.join(CACHE_DIR_BASE, lang);
  const outFile = path.join(outDir, `${slug}.md`);
  const cacheFile = path.join(cacheDir, `${slug}.json`);
  const exists = fs.existsSync(outFile);
  if (exists) {
    logLine(`Skip exists: ${outFile}`);
    return;
  }
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(await fsp.readFile(cacheFile, "utf8"));
      const body = injectAffiliatePlaceholder(cached.content || "");
      await fsp.writeFile(
        outFile,
        toFrontMatter({ title: cached.title || rec.keyword, meta_description: cached.meta_description || "", slug }, body, lang),
        "utf8"
      );
      logLine(`Write from cache: ${outFile}`);
      return;
    } catch (e) {
      logLine(`Cache read error for ${slug} (${lang}): ${e.message}`);
    }
  }

  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    throw new Error("Missing required env: OPENAI_API_KEY or GEMINI_API_KEY");
  }

  const { system, user } = buildPrompt(rec, lang);
  let content;

  if (GEMINI_API_KEY) {
    logLine(`Generating with Gemini (${lang}): ${rec.keyword}`);
    content = await callWithRetry(() => geminiChatJSON(system, user), 3, 2000);
  } else {
    logLine(`Generating with OpenAI (${lang}): ${rec.keyword}`);
    content = await callWithRetry(() => openaiChatJSON(system, user), 3, 1500);
  }

  let data;
  try {
    const cleaned = content.replace(/```json\s?|```/g, "").trim();
    // Xử lý các ký tự điều khiển gây lỗi JSON.parse (như newline thực tế trong chuỗi)
    const safe = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, (match) => {
      if (match === "\n" || match === "\r" || match === "\t") return " ";
      return "";
    });
    data = JSON.parse(safe);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      data = JSON.parse(match[0]);
    } else {
      throw new Error("AI response is not valid JSON");
    }
  }
  const title = String(data.title || rec.keyword).trim();
  const meta = String(data.meta_description || "").trim();
  const bodyRaw = String(data.content || "").trim();
  const body = injectAffiliatePlaceholder(bodyRaw);

  await fsp.writeFile(
    outFile,
    toFrontMatter({ title, meta_description: meta, slug }, body, lang),
    "utf8"
  );
  await fsp.writeFile(cacheFile, JSON.stringify({ title, meta_description: meta, content: bodyRaw }, null, 2), "utf8");
  logLine(`Generated (${lang}): ${outFile}`);
}

async function run() {
  for (const lang of LANGUAGES) {
    await ensureDirs(lang);
  }

  if (process.env.PREVIEW === "true") {
    logLine("Preview mode: skipping content generation");
    return;
  }
  const rows = await readCSV(CSV_PATH);

  const rateMs = Number(process.env.RATE_DELAY_MS || 5000);
  const batchSize = Number(process.env.BATCH_SIZE || 30);

  for (const lang of LANGUAGES) {
    logLine(`Starting generation for language: ${lang}`);
    let i = 0;
    while (i < rows.length) {
      const slice = rows.slice(i, i + batchSize);
      logLine(`[${lang}] Starting batch ${i / batchSize + 1} with ${slice.length} records`);
      await Promise.all(
        slice.map((r, idx) =>
          processRecord(r, 0, lang).catch((e) => {
            logLine(`Error for "${r.keyword}" (${lang}): ${e.message}`);
          })
        )
      );
      i += batchSize;
      if (i < rows.length) {
        logLine(`[${lang}] Waiting ${rateMs}ms before next batch...`);
        await new Promise((r) => setTimeout(r, rateMs));
      }
    }
  }
  logLine("Done.");
}

run().catch((e) => {
  logLine(`Fatal: ${e.stack || e.message}`);
  process.exitCode = 1;
});
