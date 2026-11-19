export interface VikramRadioContext {
  cratesCollected: number;
  totalCrates: number;
  timeOfDayLabel: 'Golden Dusk' | 'Nightfall';
  health: number;
  enemiesAlive: number;
  kills: number;
}

const RADIO_TIMEOUT_MS = 5000;

export function buildVikramFallback(
  playerMessage: string,
  ctx: VikramRadioContext,
): string {
  const q = playerMessage.toLowerCase();
  const remaining = Math.max(0, ctx.totalCrates - ctx.cratesCollected);
  const vitalsNote =
    ctx.health < 45
      ? `Your vitals are down to ${ctx.health}%—fall back into the purple UV Safe House ring beneath my tower to recover.`
      : `Vitals steady at ${ctx.health}% with ${ctx.enemiesAlive} infected active nearby.`;

  if (ctx.cratesCollected >= ctx.totalCrates) {
    return `All ${ctx.totalCrates}/${ctx.totalCrates} GRE Antizin crates are secured! Get back inside the Taj UV Safe House Gate now—my M16 is covering the approach.`;
  }

  if (q.includes('crate') || q.includes('antizin') || q.includes('where') || q.includes('supply')) {
    return `${ctx.cratesCollected}/${ctx.totalCrates} Antizin crates recovered (${remaining} left) in ${ctx.timeOfDayLabel}. Climb the wooden parkour ramps onto the East and West bazaar rooftops and check the south auto-rickshaw wreckage—hold E for 2.5 seconds to unlock each crate.`;
  }

  if (q.includes('gate') || q.includes('uv') || q.includes('safe') || q.includes('tower')) {
    return `The Taj Mahal UV Safe House Gate is directly beneath my watchtower. Step inside the purple UV ring anytime to repel biters and restore your health (${ctx.health}%).`;
  }

  if (q.includes('fire') || q.includes('m16') || q.includes('cover') || q.includes('shoot') || q.includes('hazmat')) {
    return `My M16 fires automatic covering bursts at any infected within 18 meters of the watchtower! Watch out for Hazmat Guards with red tanks, and Right-Click to counter yellow lightning attacks.`;
  }

  if (q.includes('help') || q.includes('heal') || q.includes('health') || q.includes('tip')) {
    return `${vitalsNote} Build a 5x freeflow combo to unleash an [R] Heavy Takedown shockwave, and use the wooden ramps to stay above the horde while grabbing the remaining ${remaining} crate(s).`;
  }

  return `Copy that, survivor. ${ctx.timeOfDayLabel} is deepening with ${ctx.cratesCollected}/${ctx.totalCrates} Antizin crates recovered and health at ${ctx.health}%. ${ctx.health < 50 ? 'Heal inside the UV gate first, then ' : 'Keep moving and '}secure the remaining ${remaining} crate(s).`;
}

export async function askHavildarVikram(
  playerMessage: string,
  ctx: VikramRadioContext,
): Promise<string> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const fetchPromise = fetch('/api/vikram-radio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: playerMessage,
        context: ctx,
      }),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Radio status ${response.status}`);
      }
      const data = (await response.json()) as { reply?: string };
      return data.reply?.trim() || buildVikramFallback(playerMessage, ctx);
    });

    const timeoutPromise = new Promise<string>((resolve) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        resolve(buildVikramFallback(playerMessage, ctx));
      }, RADIO_TIMEOUT_MS);
    });

    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch {
    return buildVikramFallback(playerMessage, ctx);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
