# Caddie — Home Assistant voice capture

This guide wires Google Home → Home Assistant → Caddie so that anything you say to a Google Home speaker lands in your Caddie capture queue.

---

## How it works

```
You speak to Google Home
        │
        ▼
Home Assistant Assist pipeline
  (STT via Google Cloud or Whisper)
        │
        ▼
  Custom intent fires
        │
        ▼
POST /api/capture/voice   ← Caddie webhook (this endpoint)
        │
        ▼
  Claude extracts things & steps
        │
        ▼
  Saved to your Caddie account
```

---

## Prerequisites

- Home Assistant with the **Google Assistant SDK** or **Google Home** integration configured (so HA can hear your speaker)
- Alternatively: **Assist** with a local Whisper STT pipeline — works without Google Cloud
- Your Caddie deployment is reachable from your HA instance (Nabu Casa / Cloudflare Tunnel / public URL)

---

## Step 1 — Add the webhook secret to Caddie

Generate a random secret (e.g. `openssl rand -hex 32`) and add it to your Caddie `.env.local`:

```
VOICE_WEBHOOK_SECRET=your-secret-here
```

Redeploy (or restart the dev server) for the env var to take effect.

---

## Step 2 — Find your Caddie user ID

1. Open your Caddie app and sign in
2. In your browser's dev tools, run:
   ```js
   (await (await import('/node_modules/@supabase/supabase-js/dist/module/index.js')).createClient(
     window.__ENV?.SUPABASE_URL, window.__ENV?.SUPABASE_KEY
   ).auth.getUser()).data.user.id
   ```
   Or more practically: open Supabase Studio → Authentication → Users → copy your user UUID.

---

## Step 3 — Add a Home Assistant secret

In `secrets.yaml`:

```yaml
caddie_webhook_secret: "your-secret-here"
caddie_user_id: "your-supabase-user-uuid"
caddie_url: "https://your-caddie-app.vercel.app"
```

---

## Step 4 — Create a custom sentence / intent

In your HA config directory, create or append to `config/custom_sentences/en/caddie.yaml`:

```yaml
language: "en"
intents:
  CaddieCapture:
    data:
      - sentences:
          - "add to caddie {text}"
          - "caddie {text}"
          - "remember {text}"
```

Then in `config/intents.yaml` (or your main `configuration.yaml`):

```yaml
intent_script:
  CaddieCapture:
    action:
      - service: rest_command.caddie_capture
        data:
          text: "{{ text }}"
```

---

## Step 5 — Add the REST command

In `configuration.yaml`:

```yaml
rest_command:
  caddie_capture:
    url: "{{ caddie_url }}/api/capture/voice"
    method: POST
    headers:
      Authorization: "Bearer {{ caddie_webhook_secret }}"
      Content-Type: "application/json"
    payload: >
      {
        "text": "{{ text }}",
        "user_id": "{{ caddie_user_id }}"
      }
```

Or with hardcoded values if you prefer not to use templating on the URL:

```yaml
rest_command:
  caddie_capture:
    url: "https://your-caddie-app.vercel.app/api/capture/voice"
    method: POST
    headers:
      Authorization: "Bearer your-secret-here"
      Content-Type: "application/json"
    payload: '{"text": "{{ text }}", "user_id": "your-supabase-user-uuid"}'
```

---

## Step 6 — Reload and test

1. In HA Developer Tools → YAML → reload **Custom Sentences** and **Rest Commands**
2. Test via Developer Tools → Template:
   ```
   {{ states('input_text.test') }}
   ```
3. Or test directly with curl:
   ```bash
   curl -X POST https://your-caddie-app.vercel.app/api/capture/voice \
     -H "Authorization: Bearer your-secret-here" \
     -H "Content-Type: application/json" \
     -d '{"text": "bleed the radiator and book the car in", "user_id": "your-uuid"}'
   ```
   Expected response:
   ```json
   {"saved":[{"thing_id":"...","name":"Radiator"},{"thing_id":"...","name":"Car service"}]}
   ```

4. Say to your Google Home: **"Hey Google, add to Caddie — bleed the radiator"**

---

## Endpoint reference

```
POST /api/capture/voice
Authorization: Bearer <VOICE_WEBHOOK_SECRET>
Content-Type: application/json

{
  "text": "bleed the radiator, book the car in",
  "user_id": "supabase-user-uuid"
}
```

**Response 201:**
```json
{ "saved": [{ "thing_id": "uuid", "name": "Radiator" }, ...] }
```

**Error responses:**
| Status | Meaning |
|--------|---------|
| 401 | Wrong or missing bearer token |
| 400 | Missing `text` or `user_id` |
| 422 | Text parsed but no things extracted |
| 503 | `VOICE_WEBHOOK_SECRET` or `ANTHROPIC_API_KEY` not set |

---

## Multi-user households

The `user_id` field lets each person in the house route voice captures to their own account. Create one HA script per person, each with a different `user_id`, and trigger via different wake phrases or HA person entities.

---

## Household display (bonus)

Once this is wired, you can add a Lovelace card that calls `GET /api/offer` (authenticated via a long-lived HA token or a dedicated read-only key) and displays the current offers on a wall-mounted tablet — hitting both of Harkin's progress-display amplifiers (physically visible, publicly present) without asking anyone to report to each other.

This is noted in DESIGN.md as a planned feature; the webhook is the prerequisite.
