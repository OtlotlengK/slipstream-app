# AI POP analysis (feature branch only)

This function is not deployed automatically by the Vercel preview. It is a Supabase Edge Function and must be deployed separately after review.

## Required Edge Function secrets

- `OPENAI_API_KEY`: server-side OpenAI API key. Never put this in browser code or a `VITE_*` / `NEXT_PUBLIC_*` variable.
- `OPENAI_MODEL` (optional): defaults to `gpt-4.1-mini`.
- Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions.

Before enabling this endpoint for real merchants, review the applicable OpenAI data controls, retention terms, and privacy notice. The function sends the selected POP document and limited invoice context to OpenAI for extraction. It does not send the file to OpenAI until the authenticated merchant explicitly invokes this endpoint.

## Request

Send an authenticated POST to `/functions/v1/analyze-pop`:

```json
{
  "invoice_id": "merchant-owned invoice UUID",
  "submission_id": "matching invoice_pop_submissions UUID"
}
```

The function verifies the Supabase user, checks invoice and submission ownership, downloads the file from the private `pop-files` bucket, extracts visible fields, compares amount/currency/invoice number deterministically, and writes analysis to the existing `invoice_pop_submissions.evidence` and `checks` JSONB fields.

## Safety properties and limits

- Does not create a receipt, mark an invoice paid, or set `settlement_confirmed=true`.
- A mismatch can set the Shield status to `suspicious`; an existing `duplicate` status is preserved.
- Missing or uncertain fields stay unknown; they are not treated as a match.
- AI extraction is not document authentication, forensic forgery detection, or proof of bank settlement.
- Files larger than 8 MiB are rejected for AI analysis.
- The in-memory rate limit is per running Edge Function instance; use a persistent/shared limiter before relying on it at scale.
- Do not deploy until a staging test covers unauthenticated access, cross-merchant access, image/PDF extraction, missing/ambiguous fields, mismatches, duplicate status preservation, OpenAI timeout/failure, and successful persistence.
