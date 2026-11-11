// Seedance 2.5 text-to-video with the official Higgsfield SDK.
// Run: npm run video   (reads HF_CREDENTIALS=key-id:key-secret from .env.local; server-side only)
import { config, higgsfield } from '@higgsfield/client/v2';

if (!process.env.HF_CREDENTIALS) {
  console.error('HF_CREDENTIALS is not set. Add HF_CREDENTIALS=key-id:key-secret to .env.local.');
  process.exit(1);
}
config({ credentials: process.env.HF_CREDENTIALS, maxPollTime: 15 * 60_000 }); // video can take longer than the 5 min default

try {
  const result = await higgsfield.subscribe('bytedance/seedance-2.5/text-to-video', {
    input: { prompt: 'A cinematic scene at sunset', duration: 5, resolution: '720p', aspect_ratio: '16:9' },
    withPolling: true,
  });
  const status: string = result.status, url = result.video?.url;
  if (status === 'completed' && url) console.log(url);
  else {
    const why = status === 'nsfw' ? 'rejected by content moderation' : status === 'failed' ? `generation failed${(result as { error?: string }).error ? `: ${(result as { error?: string }).error}` : ''}`
      : status === 'canceled' ? 'request was canceled' : status === 'completed' ? 'completed without a video URL' : `ended with status "${status}"`;
    console.error(`No video (request ${result.request_id}): ${why}.`);
    process.exitCode = 1;
  }
} catch (e) { // never print the error object itself: it can carry request headers
  console.error(`Request did not complete: ${e instanceof Error ? `${e.name}: ${e.message}` : 'unknown error'}`);
  process.exitCode = 1;
}
