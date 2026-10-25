# WhatsApp setup

This runbook connects harpy to WhatsApp through the Meta WhatsApp Cloud API. After it, you can message harpy from your phone (text, voice notes, photos), review drafts with Approve, Edit and Skip buttons, and get a nudge when drafts are ready. Allow about an hour, plus Meta's template approval time.

harpy answers only phones it knows. A number is known if it is in `HARPY_WHATSAPP_ALLOWED_NUMBERS` or if it linked itself with a code from the Channels page. Everyone else gets silence.

## Steps

1. Create the Meta app. Go to developers.facebook.com, create an app of the Business type, and add the WhatsApp product.
2. Use the free test number. In the WhatsApp product, note the Phone number ID and the WhatsApp Business Account ID. Add your own phone as a test recipient and verify it with the code Meta sends.
3. Create a token that doesn't expire. In Meta Business settings, create a System User with admin access to the app and to the WhatsApp account. Generate a token for it with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions, and choose never-expiring. Copy it now; Meta shows it once.
4. Copy the App secret from App settings, Basic.
5. Pick a verify token. It is any random string you make up, for example the output of `openssl rand -hex 24`. You enter the same string in Vercel and in Meta.
6. Set the variables in Vercel, for production and preview:

   | Variable | Value |
   | --- | --- |
   | `WHATSAPP_ACCESS_TOKEN` | The never-expiring System User token from step 3. |
   | `WHATSAPP_APP_SECRET` | The App secret from step 4. |
   | `WHATSAPP_PHONE_NUMBER_ID` | The Phone number ID from step 2. |
   | `WHATSAPP_VERIFY_TOKEN` | The string from step 5. |
   | `WHATSAPP_BUSINESS_ACCOUNT_ID` | The WhatsApp Business Account ID from step 2. |
   | `HARPY_WHATSAPP_ALLOWED_NUMBERS` | Your own number, digits only with the country code. More numbers can follow, comma-separated. |
   | `HARPY_WHATSAPP_NUMBER` | The test number people message, digits only. It builds the wa.me link on the Channels page. |

   ```bash
   printf '%s' "<value>" | vercel env add WHATSAPP_ACCESS_TOKEN production preview
   ```

   Repeat for each variable. harpy turns WhatsApp on only when the first four are all set. If one is missing, the whole channel stays off.

   Check that `REDIS_URL` is a `rediss://` URL (the TCP address from Upstash, not the REST address). The Chat SDK keeps conversation state there; with no TCP URL it falls back to memory, which doesn't survive between serverless calls. Then redeploy so the new values apply.
7. Set the webhook. In the WhatsApp product, Configuration, set the callback URL to `https://eve-harpy.vercel.app/eve/v1/whatsapp` and the verify token to the string from step 5. Verify it, then subscribe to `messages` and `user_id_update`.
8. Create the seven message templates. In WhatsApp Manager, create each one with category Utility and language English (`en`), using the table below word for word, including the quick-reply buttons. Submit them for approval. Cards and replies work without templates; the templates are used only when you haven't messaged harpy in the last 24 hours.
9. Say hi. From your phone, send "hi" to the test number. harpy answers. Then work through the [stage 3 owner checklist](setup-and-deploy.md#stage-3-owner-checklist).
10. Local development. Use a tunnel such as `cloudflared tunnel --url http://localhost:3000` and point a separate Meta test app at it. Never point the production app at a tunnel. Preview deployments sit behind Deployment Protection and can't receive webhooks.
11. Optional: move to a dedicated number. Register the number, get its display name approved, add a payment method, and change `WHATSAPP_PHONE_NUMBER_ID` (and `HARPY_WHATSAPP_NUMBER`) to the new number. Nothing else changes.

## The seven templates

Name each template exactly as shown. The `{{1}}` markers are parameters, and the example values are what you give Meta as sample content. These come from `lib/whatsapp/templates.ts`; if you change the wording there, resubmit the template.

| Name | Body | Example values | Quick-reply buttons |
| --- | --- | --- | --- |
| `harpy_morning_brief` | Your content brief for {{1}} is ready: {{2}} trends and {{3}} post ideas. | Thu 22 Oct, 3, 5 | Show brief, Not today |
| `harpy_drafts_ready` | You have {{1}} new drafts to review: {{2}} | 3, Small teams ship faster | Review |
| `harpy_post_published` | Your {{1}} post is live. | LinkedIn | View post |
| `harpy_post_failed` | Your {{1}} post could not be published: {{2}} | X, the image was too large | Retry, Open |
| `harpy_new_activity` | {{1}} new replies and mentions. {{2}} may need a response. | 4, 2 | Review now, Later |
| `harpy_weekly_report` | Your weekly summary for {{1}} is ready. | 19 to 25 Oct | Show summary |
| `harpy_reconnect_needed` | Your {{1}} connection needs you to sign in again by {{2}}. | LinkedIn, Mon 14 Dec | Open Channels |

Only `harpy_drafts_ready` is sent in stage 3. The others are submitted now so they are approved when the later stages need them.

## If something doesn't work

- Meta can't verify the webhook: the verify token in Meta must match `WHATSAPP_VERIFY_TOKEN` exactly, and the deployment must include the variables (redeploy after setting them).
- harpy never answers: check that your number, digits only, is in `HARPY_WHATSAPP_ALLOWED_NUMBERS`, or link it from the Channels page (Link a phone, then send the `LINK` code).
- Messages send only to verified test recipients while you use the free test number.
- Cards stop arriving after a day of silence: that is the 24-hour window. harpy sends the `harpy_drafts_ready` template instead, and tapping Review sends the cards. Until that template is approved, nothing arrives outside the window.
