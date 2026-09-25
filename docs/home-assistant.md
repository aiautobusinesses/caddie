# GYST — Home Assistant voice capture

This guide wires Google Home → Home Assistant → GYST so that anything you say to a Google Home speaker lands in your GYST capture queue.

> **Advanced accounts only.** Home Assistant integration requires an Advanced GYST account. Contact your invite sender to request the Advanced tier.

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
POST /api/capture/voice   ← GYST webhook (this endpoint)
  Authorization: Bearer <your-integration-token>
        │
        ▼
  Claude extracts things & steps
  (using your personal Anthropic key)
        │
        ▼
  Saved to your GYST account
```

---

## Prerequisites

- An Advanced GYST account
- Your Anthropic API key configured in GYST Settings
- Home Assistant with the **Google Assistant SDK** or **Google Home** integration configured
- Alternatively: **Assist** with a local Whisper STT pipeline — works without Google Cloud
- Your GYST deployment is reachable from your HA instance (Nabu Casa / Cloudflare Tunnel / public URL)

---

## Step 1 — Generate an integration token in GYST

1. Open your GYST app and sign in
2. Tap **Settings** in the bottom nav
3. Scroll to the **Integrations** section (visible on Advanced accounts only)
4. Select **Home Assistant** from the provider dropdown and tap **Generate token**
5. Copy the token — it will look like a 64-character hex string

This token uniquely identifies your account. Keep it private.

---

## Step 2 — Add the token and URL to Home Assistant

In `secrets.yaml`:

```yaml
GYST_integration_token: "your-64-char-token-here"
GYST_url: "https://your-GYST-app.vercel.app"
```

---

## Step 3 — Create a custom sentence / intent

In your HA config directory, create or append to `config/custom_sentences/en/GYST.yaml`:

```yaml
language: "en"
intents:
  GYSTCapture:
    data:
      - sentences:
          - "add to GYST {text}"
          - "GYST {text}"
          - "remember {text}"
```

Then in `config/intents.yaml` (or your main `configuration.yaml`):

```yaml
intent_script:
  GYSTCapture:
    action:
      - service: rest_command.GYST_capture
        data:
          text: "{{ text }}"
```

---

## Step 4 — Add the REST command

In `configuration.yaml`:

```yaml
rest_command:
  GYST_capture:
    url: "{{ GYST_url }}/api/capture/voice"
    method: POST
    headers:
      Authorization: "Bearer {{ GYST_integration_token }}"
      Content-Type: "application/json"
    payload: >
      {
        "text": "{{ text }}"
      }
```

Or with hardcoded values:

```yaml
rest_command:
  GYST_capture:
    url: "https://your-GYST-app.vercel.app/api/capture/voice"
    method: POST
    headers:
      Authorization: "Bearer your-64-char-token-here"
      Content-Type: "application/json"
    payload: '{"text": "{{ text }}"}'
```

---

## Step 5 — Reload and test

1. In HA Developer Tools → YAML → reload **Custom Sentences** and **Rest Commands**
2. Test directly with curl:
   ```bash
   curl -X POST https://your-GYST-app.vercel.app/api/capture/voice \
     -H "Authorization: Bearer your-64-char-token-here" \
     -H "Content-Type: application/json" \
     -d '{"text": "bleed the radiator and book the car in"}'
   ```
   Expected response:
   ```json
   {"saved":[{"thing_id":"...","name":"Radiator"},{"thing_id":"...","name":"Car service"}]}
   ```

3. Say to your Google Home: **"Hey Google, add to GYST — bleed the radiator"**

---

## Endpoint reference

```
POST /api/capture/voice
Authorization: Bearer <integration-token>
Content-Type: application/json

{
  "text": "bleed the radiator, book the car in"
}
```

**Response 201:**
```json
{ "saved": [{ "thing_id": "uuid", "name": "Radiator" }, ...] }
```

**Error responses:**
| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid integration token |
| 400 | Missing `text` field |
| 422 | Text parsed but no things extracted |
| 503 | Anthropic API key not configured for this account |

---

## Multi-device households

Each person in the household gets their own integration token from their own GYST account. Create one HA REST command per person, each referencing a different token, and trigger via different wake phrases or HA person entities.

There is no shared `user_id` in the request body — the token lookup resolves the owning account server-side.

---

## Revoking access

To revoke a token, return to **Settings → Integrations** in GYST and tap **Remove** next to the Home Assistant integration. The token is immediately invalidated and any future requests using it will receive 401.
