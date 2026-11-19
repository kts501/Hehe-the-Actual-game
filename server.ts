import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import type { HudSnapshot } from './src/types/game';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

interface HistoryEntry {
  sender: 'runner' | 'vikram';
  text: string;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildVikramSystemInstruction(snapshot: HudSnapshot): string {
  const healthPct = Math.max(
    0,
    Math.min(100, Math.round((snapshot.health / Math.max(1, snapshot.maxHealth)) * 100)),
  );
  const crateStatuses = Array.isArray(snapshot.crateStatuses) ? snapshot.crateStatuses : [];
  const remainingCrates = crateStatuses.filter((c) => !c.collected);
  const cratesRemaining = Math.max(0, snapshot.totalCrates - snapshot.cratesCollected);
  const remainingSummary =
    remainingCrates.length > 0
      ? remainingCrates
          .map((c) => `${c.label} at ${c.locationHint} (${c.distance}m away)`)
          .join('; ')
      : 'None — all 3 Antizin crates are secured. Taj Mahal UV Safe House entry is authorized.';

  return [
    'You are Havildar Vikram, a strict, disciplined, no-nonsense Indian Quarantine Force watchtower guard stationed at the Taj Mahal UV Safe House perimeter gate in Agra.',
    'You are communicating with the field Runner over a short-range military radio from your elevated watchtower overlooking the Charbagh courtyard.',
    '',
    'LIVE TACTICAL TELEMETRY:',
    `- Antizin Supplies Collected: ${snapshot.cratesCollected}/${snapshot.totalCrates} (${cratesRemaining} remaining)`,
    `- Remaining Crate Locations: ${remainingSummary}`,
    `- Runner Health: ${healthPct}%`,
    `- Local Time & Atmosphere: ${snapshot.formattedTime} | ${snapshot.timeLabel}${snapshot.isNight ? ' (NIGHTFALL ACTIVE: Night Hunters and Virals are actively prowling; UV perimeter barrier online)' : ' (Dusk approaching Nightfall)'}`,
    `- Infected Eliminated: ${snapshot.killCount}`,
    `- Distance to Taj UV Gate: ${snapshot.tajDistance}m`,
    snapshot.nightHunterNearby
      ? `- CRITICAL PROXIMITY ALERT: APEX NIGHT HUNTER DETECTED ${snapshot.nearestNightHunterDistance ?? '<28'}m FROM THE RUNNER! Override normal crate protocol and demand IMMEDIATE EXTRACTION to the Taj Mahal UV Safe House perimeter!`
      : '- Night Hunter Proximity: Clear within 28m sensor ring.',
    '',
    'ROLEPLAY & RESPONSE RULES:',
    '1. Stay strictly in character as Havildar Vikram. Speak in crisp, authoritative military radio English (1 to 3 short sentences max, plain text only, no markdown or bullet lists).',
    '2. PRIORITY OVERRIDE: If a Night Hunter is detected nearby (CRITICAL PROXIMITY ALERT active), urgency is absolute — order immediate sprint/zipline extraction back to the purple Taj Mahal UV Safe House perimeter right now.',
    '3. If no Night Hunter is nearby and cratesCollected < totalCrates and the Runner asks to enter, requests extraction, claims to be done, or reports in before finishing, firmly reprimand them in the style of: "Affirmative. Why didn\'t you complete the task? There are still crates left. Continue." — while ALSO directly answering whatever specific question they asked.',
    '4. If the Runner asks where remaining crates are, give exact location hints and distances from the telemetry above.',
    '5. If the Runner asks about ammo, healing, or threats, stay strict and grounded: no spare rifle rounds can be dropped outside the UV perimeter; conserve stamina, Right-Click yellow lightning bolts to counter, use [C] kick or [Q] firecrackers on armored Brutes, and use rooftop ziplines to outrun Night Hunters.',
    '6. If cratesCollected === totalCrates, acknowledge mission completion briskly and order the Runner inside the purple Taj Mahal UV archway immediately while you cover their approach.',
  ].join('\n');
}

function mapHistoryContents(history: HistoryEntry[] | undefined, limit: number) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m): m is HistoryEntry =>
        Boolean(m) &&
        (m.sender === 'runner' || m.sender === 'vikram') &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0,
    )
    .slice(-limit)
    .map((m) => ({
      role: m.sender === 'runner' ? ('user' as const) : ('model' as const),
      parts: [{ text: m.text }],
    }));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/radio/chat', async (req, res) => {
    try {
      const { message, history, snapshot } = req.body as {
        message?: string;
        history?: HistoryEntry[];
        snapshot?: HudSnapshot;
      };

      const trimmedMessage = typeof message === 'string' ? message.trim() : '';
      if (!trimmedMessage || !snapshot) {
        res.status(400).json({ error: 'Missing radio message or tactical snapshot.' });
        return;
      }

      const ai = getAiClient();
      const historyContents = mapHistoryContents(history, 8);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...historyContents,
          {
            role: 'user' as const,
            parts: [{ text: trimmedMessage }],
          },
        ],
        config: {
          systemInstruction: buildVikramSystemInstruction(snapshot),
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({ error: 'Empty response from watchtower radio.' });
        return;
      }

      res.json({ reply: replyText });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Watchtower radio request failed.';
      console.error('[api/radio/chat]', err);
      res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/radio/hunter-alert', async (req, res) => {
    try {
      const { history, snapshot } = req.body as {
        history?: HistoryEntry[];
        snapshot?: HudSnapshot;
      };

      if (!snapshot) {
        res.status(400).json({ error: 'Missing tactical snapshot.' });
        return;
      }

      const distLabel =
        snapshot.nearestNightHunterDistance !== null &&
        snapshot.nearestNightHunterDistance !== undefined
          ? `${snapshot.nearestNightHunterDistance}m`
          : 'close range';

      const alertPrompt = [
        `[WATCHTOWER MOTION SENSOR TRIGGER: NIGHT HUNTER AT ${distLabel}]`,
        snapshot.cratesCollected < snapshot.totalCrates
          ? `A Night Hunter apex predator just entered within ${distLabel} of the Runner while ${snapshot.totalCrates - snapshot.cratesCollected} crate(s) remain. Break normal crate protocol and deliver an urgent, unique 1-3 sentence radio order demanding IMMEDIATE EXTRACTION back to the Taj Mahal UV Safe House perimeter (${snapshot.tajDistance}m away) using rooftops or ziplines right now.`
          : `A Night Hunter apex predator just entered within ${distLabel} of the Runner with all crates secured. Deliver an urgent, unique 1-3 sentence radio order demanding IMMEDIATE EXTRACTION straight inside the purple Taj Mahal UV archway (${snapshot.tajDistance}m away) while you lay down covering fire.`,
      ].join(' ');

      const ai = getAiClient();
      const recentHistory = mapHistoryContents(history, 6);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...recentHistory,
          {
            role: 'user' as const,
            parts: [{ text: alertPrompt }],
          },
        ],
        config: {
          systemInstruction: buildVikramSystemInstruction(snapshot),
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({ error: 'Empty extraction alert from watchtower radio.' });
        return;
      }

      res.json({ reply: replyText });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Watchtower hunter alert failed.';
      console.error('[api/radio/hunter-alert]', err);
      res.status(500).json({ error: errMsg });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
