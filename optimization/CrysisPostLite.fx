#include "ReShade.fxh"

uniform float uSharpen <
  ui_type = "slider";
  ui_min = 0.0; ui_max = 1.0;
  ui_label = "Contrast-Adaptive Sharpening";
> = 0.56;

uniform float uContrast <
  ui_type = "slider";
  ui_min = 0.0; ui_max = 0.5;
  ui_label = "Filmic S-Curve Strength";
> = 0.16;

uniform float uGreenBoost <
  ui_type = "slider";
  ui_min = 0.0; ui_max = 0.35;
  ui_label = "Jungle Foliage Chlorophyll Boost";
> = 0.12;

uniform float uWarmHighlight <
  ui_type = "slider";
  ui_min = 0.0; ui_max = 0.2;
  ui_label = "Golden-Hour Highlight Tint";
> = 0.045;

uniform float uVignetteDarkness <
  ui_type = "slider";
  ui_min = 0.0; ui_max = 1.0;
  ui_label = "Cinematic Edge Vignette";
> = 0.38;

uniform float uDitherStrength <
  ui_type = "slider";
  ui_min = 0.0; ui_max = 2.0;
  ui_label = "Triangular Blue-Noise Dither";
> = 1.2;

float IGN(float2 p)
{
  return frac(52.9829189 * frac(dot(p, float2(0.06711056, 0.00583715))));
}

float3 CrysisPostLitePS(float4 vpos : SV_Position, float2 texcoord : TexCoord) : SV_Target
{
  float2 px = ReShade::PixelSize;
  float3 c = tex2D(ReShade::BackBuffer, texcoord).rgb;
  float3 n = tex2D(ReShade::BackBuffer, texcoord + float2(0.0, px.y)).rgb;
  float3 s = tex2D(ReShade::BackBuffer, texcoord - float2(0.0, px.y)).rgb;
  float3 e = tex2D(ReShade::BackBuffer, texcoord + float2(px.x, 0.0)).rgb;
  float3 w = tex2D(ReShade::BackBuffer, texcoord - float2(px.x, 0.0)).rgb;

  // 5-tap FidelityFX-inspired Contrast-Adaptive Sharpening (zero DDR3 spill)
  float3 mn = min(c, min(min(n, s), min(e, w)));
  float3 mx = max(c, max(max(n, s), max(e, w)));
  float3 amp = saturate(min(mn, 1.0 - mx) / max(mx, 1e-4));
  float sharpWeight = -0.14 * uSharpen * dot(amp, float3(0.3333, 0.3333, 0.3333));
  float3 col = saturate((c + (n + s + e + w) * sharpWeight) / (1.0 + 4.0 * sharpWeight));

  // Gentle Filmic S-Curve without shadow crush
  float3 scurve = col * col * (3.0 - 2.0 * col);
  col = lerp(col, scurve, uContrast);

  // Crysis Jungle Chlorophyll Vibrance & Golden Dusk Highlight Tint
  float greenDom = saturate(col.g - max(col.r, col.b) * 0.85);
  col.g += greenDom * uGreenBoost;
  float luma = dot(col, float3(0.299, 0.587, 0.114));
  col *= lerp(float3(1.0, 1.0, 1.0), float3(1.0 + uWarmHighlight, 0.99, 1.0 - uWarmHighlight * 1.2), smoothstep(0.45, 0.95, luma));

  // Soft Cinematic Vignette
  float2 vigUv = texcoord * 2.0 - 1.0;
  col *= clamp(1.0 - dot(vigUv, vigUv) * (0.28 * uVignetteDarkness), 0.55, 1.0);

  // Triangular-PDF Dithering to prevent 8-bit sky banding
  float d1 = IGN(vpos.xy);
  float d2 = IGN(vpos.xy + float2(37.0, 17.0));
  col += (d1 + d2 - 1.0) * (uDitherStrength / 255.0);

  return saturate(col);
}

technique CrysisPostLite
{
  pass
  {
    VertexShader = PostProcessVS;
    PixelShader = CrysisPostLitePS;
  }
}
