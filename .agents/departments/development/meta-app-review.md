# Meta app and review: Instagram comment-to-DM

Prepared 2026-10-16. Goal: members link Instagram, pick a keyword per post ("FORMAT"), and anyone who comments that
keyword gets one automatic DM (Meta's "private reply"). This needs a Meta app with Advanced Access to the comment and
messaging permissions, which only App Review grants. Review usually takes from a few days to a few weeks. Business
verification is a separate check that must pass first.

Today: no Meta app is connected (no META_APP_ID / META_APP_SECRET in Vercel), so the existing Instagram and Facebook
posting in Distribute is also switched off. Steps 1–4 switch that posting on as well.

## 1. Create the app (founder, about 15 minutes)

1. https://developers.facebook.com/apps → **Create app** → use case **Other** → type **Business**.
   Name: `BrandForge`. Contact email: hello@brandforge.gg. Connect it to the BrandForge Business portfolio
   (create one at business.facebook.com if needed).
2. Add products: **Facebook Login for Business**, **Instagram** (the "API setup with Facebook login" option) and
   **Webhooks**.
3. **App settings → Basic**:
   - App domains: `brandforge.gg`
   - Privacy policy URL: `https://brandforge.gg/privacy`
   - Terms of service URL: `https://brandforge.gg/terms`
   - User data deletion: **Data deletion instructions URL** `https://brandforge.gg/data-deletion`
   - App icon: the BrandForge mark, 1024×1024
   - Category: Business and pages
4. **Facebook Login for Business → Settings → Valid OAuth redirect URIs**:
   `https://brandforge.gg/api/integrations/meta/callback`
5. Copy **App ID** and **App secret** into Vercel (`brandforge-site`, Production, Sensitive):
   `META_APP_ID`, `META_APP_SECRET`. Tell Claude: redeploy and verify that linking Instagram works with your own
   account (that works in Development mode before any review).

## 2. Business verification (founder)

business.facebook.com → **Settings → Security center → Start verification**. It needs the legal business name,
address, phone and one document (business registration or a utility bill in the business name). Usually 1–5 days.

## 3. Permissions to request in App Review

Already used for posting (request Advanced Access so any member can link):
`pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`,
`business_management`.

New for comment-to-DM:

| Permission | Why BrandForge needs it (paste as the use-case text) |
| --- | --- |
| `instagram_manage_comments` | BrandForge lets a business choose a keyword for one of its own Instagram posts. We read new comments on that post (through the comments webhook) to see whether a comment contains the keyword the business chose. We do not read or store comments on posts that have no keyword rule, and we never post comments. |
| `instagram_manage_messages` | When someone comments the business's keyword, BrandForge sends that person one private reply (a single DM through the Private Replies API) with the message the business wrote, for example a link they asked for. One reply per comment, only within Meta's 7-day window, and never to people who did not comment. |
| `pages_manage_metadata` | Needed to subscribe the business's connected Page and Instagram account to the comments webhook, so new comments on keyword posts reach BrandForge. |

## 4. Webhook (Claude builds it before submitting)

- Callback URL: `https://brandforge.gg/api/webhooks/meta`
- Verify token: a random value stored as `META_WEBHOOK_VERIFY_TOKEN` in Vercel
- Subscribe the **Instagram** object to the `comments` field (and `messages` for delivery errors).
- Payload signatures are checked with the app secret (`X-Hub-Signature-256`).

## 5. The screencast reviewers need (one per new permission, can be one video)

Record on brandforge.gg in Development mode with the founder's own Instagram professional account:

1. Settings → Integrations → **Link Instagram** → the Meta login dialog showing the requested permissions → back in
   BrandForge, the account shows as linked.
2. Distribute → a post → **Comment-to-DM**: type keyword `FORMAT` and the DM text "Here you go: brandforge.gg/distribute".
   Save.
3. On a phone with a second Instagram account, comment "FORMAT" on that post.
4. Show the second account receiving the private reply in its DMs within seconds.
5. Back in BrandForge: the rule shows "1 reply sent", and **Turn off** stops it.

Keep it under 3 minutes, English UI, cursor visible, no cuts in the middle of a flow.

## 6. Order of work

1. Founder: steps 1–2 (app and business verification). Claude: redeploy and check posting with the founder's account.
2. Claude: build the webhook, the keyword rules (per post: keyword, DM text, on/off, replies sent), the private-reply
   sender, rate limits and an opt-out, all working in Development mode with the founder's account.
3. Record the screencast, submit App Review for the permissions in step 3.
4. On approval: switch the app to Live; the feature opens to members (paid plan candidate).

Until approval, the same mechanic can run on BrandForge's own account by hand or with ManyChat's free plan (see
marketing/reels/one-post-every-format.md).
