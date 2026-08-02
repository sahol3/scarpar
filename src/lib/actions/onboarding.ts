'use server'

import { audit } from '@/lib/audit'
import { requireUser, type OrgContext } from '@/lib/auth'
import { setActiveOrg } from '@/lib/actions/set-org'
import { seedDemoData } from '@/lib/demo-seed'
import { SETTING_DEFS } from '@/lib/settings/registry'
import { getAdminClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/lib/types'
import { slugify } from '@/lib/utils'
import { VERTICAL_PRESETS } from '@/modules/verticals'
import type { Json, Org } from '@/types/db'

import { createOrgSchema, type CreateOrgInput } from './onboarding-schemas'

/** doc_sequences seed rows (docs/architecture.md §3 / §9). */
const DOC_SEQUENCES: { doc_type: string; prefix: string }[] = [
  { doc_type: 'order', prefix: 'SCR-' },
  { doc_type: 'invoice', prefix: 'INV-' },
  { doc_type: 'delivery', prefix: 'DLV-' },
  { doc_type: 'return', prefix: 'RET-' },
  { doc_type: 'job', prefix: 'JOB-' },
]

/**
 * Creates a new org for the current user (owner membership + doc numbering +
 * default settings + optional demo data), then activates it.
 *
 * Uses the admin (service-role) client throughout, not just for the org row:
 * supabase/migrations/0001_core.sql's org_members RLS policy has no "insert
 * your own first membership" carve-out (a brand-new org has no members yet,
 * so has_org_role() can't pass) — the migration's own comment says this
 * bootstrap sequence is expected to run "in the same service-role
 * transaction". This action is that transaction (best-effort: Supabase JS has
 * no cross-call transaction, so failures after the org row exists return an
 * error but do not roll back earlier inserts).
 */
export async function createOrgAction(input: CreateOrgInput): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = createOrgSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const { name, phone, vertical, seedDemo } = parsed.data
  const slug = slugify(parsed.data.slug) || slugify(name)
  if (!slug) {
    return { ok: false, error: 'Enter a valid organization name.' }
  }

  const admin = getAdminClient()
  let org: Org

  try {
    const { data: taken } = await admin.from('orgs').select('id').eq('slug', slug).maybeSingle()
    if (taken) {
      return { ok: false, error: 'That URL slug is already taken — try another.' }
    }

    const { data: orgRow, error: orgError } = await admin
      .from('orgs')
      .insert({
        name,
        slug,
        vertical,
        phone,
        currency: 'DZD',
        enabled_modules: VERTICAL_PRESETS[vertical].modules,
      })
      .select('*')
      .single()

    if (orgError || !orgRow) {
      return { ok: false, error: orgError?.message ?? 'Could not create organization.' }
    }
    org = orgRow as Org

    const { error: memberError } = await admin
      .from('org_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
    if (memberError) {
      return { ok: false, error: memberError.message }
    }

    const { error: seqError } = await admin
      .from('doc_sequences')
      .insert(DOC_SEQUENCES.map((seq) => ({ org_id: org.id, ...seq })))
    if (seqError) {
      return { ok: false, error: seqError.message }
    }

    const { error: settingsError } = await admin.from('org_settings').insert(
      SETTING_DEFS.map((def) => ({
        org_id: org.id,
        key: def.key,
        value: def.default as Json,
        updated_by: user.id,
      })),
    )
    if (settingsError) {
      return { ok: false, error: settingsError.message }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create organization.' }
  }

  if (seedDemo) {
    try {
      await seedDemoData(admin, org)
    } catch (err) {
      // Demo content is a nice-to-have, not a hard requirement — the org
      // itself is already created successfully, so this never fails the
      // whole action.
      console.error('[createOrgAction] demo seed failed', err)
    }
  }

  const auditCtx: OrgContext = { user, org, role: 'owner', settings: {} }
  audit(auditCtx, 'org.created', 'org', org.id, null, { vertical: org.vertical, seedDemo })

  await setActiveOrg(org.id)
  return { ok: true }
}
