// Per-vertical demo data seeded by createOrgAction (src/lib/actions/onboarding.ts)
// when the "load demo data" checkbox is on. Called with the admin (service-role)
// client the caller already holds — this module never opens its own connection,
// so it carries no server-only guard of its own (it's only ever reachable from
// a 'use server' action).
import type { SupabaseClient } from '@supabase/supabase-js'

import { DZ_WILAYA_NAMES } from '@/lib/dz'
import { randomKey, slugify } from '@/lib/utils'
import type { CmsBlock, FaqBlock, HeroBlock, Org, Vertical } from '@/types/db'

// ---------------------------------------------------------------------------
// CMS home page + menus — every vertical gets one (architecture.md §4).
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  { q: 'What payment methods do you accept?', a: 'We accept cash on delivery (COD) nationwide.' },
  { q: 'Do you deliver outside Alger?', a: 'Yes — we deliver nationwide across all 58 wilayas.' },
  { q: 'How can I get in touch?', a: 'Use the contact details in the footer, or message us on WhatsApp.' },
]

function makeHeroBlock(org: Org): HeroBlock {
  return {
    _key: randomKey(8),
    _type: 'hero',
    heading: org.name,
    subheading: 'Quality you can trust, delivered across Algeria.',
    ctaLabel: 'Get started',
    ctaHref: '#',
  }
}

function makeFaqBlock(): FaqBlock {
  return { _key: randomKey(8), _type: 'faq', items: FAQ_ITEMS }
}

/**
 * hero + productGrid/listingsGrid/coursesGrid per vertical + faq (architecture
 * §4). Services has no dedicated grid block type in the v1 block model, so it
 * gets a contact block instead — closest equivalent for a jobs/appointments
 * business ("book a service" vs. "browse a catalog").
 */
function makeMiddleBlock(vertical: Vertical): CmsBlock {
  switch (vertical) {
    case 'ecommerce':
      return {
        _key: randomKey(8),
        _type: 'productGrid',
        title: 'Featured products',
        mode: 'featured',
        limit: 8,
      }
    case 'courses':
      return { _key: randomKey(8), _type: 'coursesGrid', limit: 8 }
    case 'realestate':
      return { _key: randomKey(8), _type: 'listingsGrid', limit: 6 }
    case 'services':
      return { _key: randomKey(8), _type: 'contact', heading: 'Book a service', showForm: true }
  }
}

const NAV_LABEL: Record<Vertical, string> = {
  ecommerce: 'Shop',
  courses: 'Courses',
  services: 'Services',
  realestate: 'Listings',
}

async function seedCmsAndMenus(admin: SupabaseClient, org: Org): Promise<void> {
  const blocks: CmsBlock[] = [makeHeroBlock(org), makeMiddleBlock(org.vertical), makeFaqBlock()]

  const { error: pageError } = await admin.from('cms_pages').insert({
    org_id: org.id,
    title: 'Home',
    slug: 'home',
    type: 'home',
    blocks,
    status: 'published',
    published_at: new Date().toISOString(),
  })
  if (pageError) throw new Error(pageError.message)

  const { error: menuError } = await admin.from('menus').insert([
    {
      org_id: org.id,
      handle: 'header',
      items: [
        { label: 'Home', href: '/' },
        { label: NAV_LABEL[org.vertical], href: '/' },
        { label: 'Contact', href: '/#contact' },
      ],
    },
    {
      org_id: org.id,
      handle: 'footer',
      items: [
        { label: 'Home', href: '/' },
        { label: 'Privacy Policy', href: '/policy/privacy' },
        { label: 'Terms', href: '/policy/terms' },
      ],
    },
  ])
  if (menuError) throw new Error(menuError.message)
}

// ---------------------------------------------------------------------------
// ecommerce — 3 categories, 6 perfume-ish products, 2 delivery zones, 1 discount
// ---------------------------------------------------------------------------

async function seedEcommerce(admin: SupabaseClient, org: Org): Promise<void> {
  const categoryNames = ['Perfumes', 'Attars', 'Gift Sets']
  const { data: categoryData, error: catError } = await admin
    .from('categories')
    .insert(
      categoryNames.map((name, i) => ({
        org_id: org.id,
        name,
        slug: slugify(name),
        sort_order: i,
      })),
    )
    .select('id, slug')
  if (catError || !categoryData) throw new Error(catError?.message ?? 'Failed to seed categories')

  const categories = categoryData as { id: string; slug: string }[]
  const categoryId = (name: string): string | null =>
    categories.find((c) => c.slug === slugify(name))?.id ?? null

  const products = [
    { name: 'Oud Al Layl', category: 'Perfumes', price: 250000, stock: 40, featured: true },
    { name: 'Rose Attar Classic', category: 'Attars', price: 90000, stock: 60, featured: false },
    { name: 'Musk Al Haramain', category: 'Perfumes', price: 180000, stock: 25, featured: true },
    { name: 'Sandalwood Mist', category: 'Perfumes', price: 120000, stock: 35, featured: false },
    { name: 'Bridal Gift Set', category: 'Gift Sets', price: 350000, stock: 15, featured: true },
    { name: 'Jasmine Attar', category: 'Attars', price: 75000, stock: 50, featured: false },
  ]

  const { error: productError } = await admin.from('products').insert(
    products.map((p) => ({
      org_id: org.id,
      name: p.name,
      slug: slugify(p.name),
      category_id: categoryId(p.category),
      status: 'active',
      price: p.price,
      stock_qty: p.stock,
      track_stock: true,
      is_featured: p.featured,
    })),
  )
  if (productError) throw new Error(productError.message)

  const outsideAlgiers = DZ_WILAYA_NAMES.filter((name) => name !== 'Alger')

  const { error: zoneError } = await admin.from('delivery_zones').insert([
    {
      org_id: org.id,
      name: 'Inside Alger',
      districts: ['Alger'],
      charge: 40000,
      cod_available: true,
      position: 0,
    },
    {
      org_id: org.id,
      name: 'Outside Alger',
      districts: outsideAlgiers,
      charge: 80000,
      cod_available: true,
      position: 1,
    },
  ])
  if (zoneError) throw new Error(zoneError.message)

  const { error: discountError } = await admin.from('discounts').insert({
    org_id: org.id,
    code: 'WELCOME10',
    title: 'Welcome 10% off',
    type: 'percent',
    value: 10,
    scope: 'all',
    is_active: true,
  })
  if (discountError) throw new Error(discountError.message)
}

// ---------------------------------------------------------------------------
// courses — 2 courses, 3 lessons
// ---------------------------------------------------------------------------

async function seedCourses(admin: SupabaseClient, org: Org): Promise<void> {
  const courseDefs = [
    { title: 'Digital Marketing Fundamentals', price: 150000 },
    { title: 'Freelancing on Upwork & Fiverr', price: 200000 },
  ]

  const { data: courseData, error: courseError } = await admin
    .from('courses')
    .insert(
      courseDefs.map((c) => ({
        org_id: org.id,
        title: c.title,
        slug: slugify(c.title),
        price: c.price,
        status: 'active',
      })),
    )
    .select('id, slug')
  if (courseError || !courseData) throw new Error(courseError?.message ?? 'Failed to seed courses')

  const courses = courseData as { id: string; slug: string }[]
  const courseId = (title: string): string | null =>
    courses.find((c) => c.slug === slugify(title))?.id ?? null

  const marketingId = courseId('Digital Marketing Fundamentals')
  const freelancingId = courseId('Freelancing on Upwork & Fiverr')

  const { error: lessonError } = await admin.from('lessons').insert([
    {
      org_id: org.id,
      course_id: marketingId,
      title: 'Introduction to Digital Marketing',
      position: 0,
      is_free: true,
    },
    { org_id: org.id, course_id: marketingId, title: 'Social Media Strategy', position: 1, is_free: false },
    {
      org_id: org.id,
      course_id: freelancingId,
      title: 'Building Your Profile',
      position: 0,
      is_free: true,
    },
  ])
  if (lessonError) throw new Error(lessonError.message)
}

// ---------------------------------------------------------------------------
// services — 2 service_jobs, 1 appointment (+ 1 demo customer: service_jobs.
// customer_id is NOT NULL, so a customer row is a structural requirement).
// ---------------------------------------------------------------------------

async function seedServices(admin: SupabaseClient, org: Org): Promise<void> {
  const { data: customerData, error: customerError } = await admin
    .from('customers')
    .insert({ org_id: org.id, name: 'Demo Customer', phone: '01700000000' })
    .select('id')
    .single()
  if (customerError || !customerData) {
    throw new Error(customerError?.message ?? 'Failed to seed demo customer')
  }
  const customer = customerData as { id: string }

  const jobDefs: { title: string; status: string; quote: number }[] = [
    { title: 'AC Servicing — Gulshan Branch', status: 'scheduled', quote: 250000 },
    { title: 'Plumbing Repair — Dhanmondi', status: 'quoted', quote: 150000 },
  ]

  const jobIds: string[] = []
  for (const job of jobDefs) {
    // Doc numbers via next_doc_number RPC only (docs/conventions.md — Misc).
    const { data: jobNo, error: rpcError } = await admin.rpc('next_doc_number', {
      p_org: org.id,
      p_doc_type: 'job',
      p_prefix: 'JOB-',
    })
    if (rpcError || !jobNo) throw new Error(rpcError?.message ?? 'Failed to allocate job number')

    const { data: jobData, error: jobError } = await admin
      .from('service_jobs')
      .insert({
        org_id: org.id,
        job_no: jobNo as string,
        customer_id: customer.id,
        title: job.title,
        status: job.status,
        quote_amount: job.quote,
      })
      .select('id')
      .single()
    if (jobError || !jobData) throw new Error(jobError?.message ?? 'Failed to seed service job')
    jobIds.push((jobData as { id: string }).id)
  }

  const startsAt = new Date()
  startsAt.setDate(startsAt.getDate() + 2)
  startsAt.setHours(11, 0, 0, 0)

  const { error: apptError } = await admin.from('appointments').insert({
    org_id: org.id,
    job_id: jobIds[0] ?? null,
    customer_id: customer.id,
    title: 'AC Servicing Visit',
    starts_at: startsAt.toISOString(),
    status: 'booked',
  })
  if (apptError) throw new Error(apptError.message)
}

// ---------------------------------------------------------------------------
// realestate — 2 listings
// ---------------------------------------------------------------------------

async function seedRealestate(admin: SupabaseClient, org: Org): Promise<void> {
  const listings = [
    {
      title: '3-Bed Apartment in Bashundhara R/A',
      purpose: 'rent',
      property_type: 'apartment',
      price: 3500000,
      area_sqft: 1450,
      beds: 3,
      baths: 2,
    },
    {
      title: 'Commercial Space in Gulshan Avenue',
      purpose: 'sale',
      property_type: 'commercial',
      price: 800000000,
      area_sqft: 2200,
      beds: null,
      baths: 2,
    },
  ]

  const { error } = await admin.from('listings').insert(
    listings.map((l) => ({
      org_id: org.id,
      title: l.title,
      slug: slugify(l.title),
      purpose: l.purpose,
      property_type: l.property_type,
      price: l.price,
      area_sqft: l.area_sqft,
      beds: l.beds,
      baths: l.baths,
      status: 'active',
    })),
  )
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------

/** Seeds the demo content for org.vertical, then the shared CMS home + menus. */
export async function seedDemoData(admin: SupabaseClient, org: Org): Promise<void> {
  switch (org.vertical) {
    case 'ecommerce':
      await seedEcommerce(admin, org)
      break
    case 'courses':
      await seedCourses(admin, org)
      break
    case 'services':
      await seedServices(admin, org)
      break
    case 'realestate':
      await seedRealestate(admin, org)
      break
  }

  await seedCmsAndMenus(admin, org)
}
