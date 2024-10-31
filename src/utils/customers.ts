import { clerkClient, ClerkClient } from '@clerk/clerk-sdk-node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const clerk = clerkClient;
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function createClerkOrganization(name: string, userId: string, domain?: string, ) {
  // Generate API key
  const apiKey = await generatePortcullisApiKey(name);

  const logoUrl = `https://img.logo.dev/${domain}?token=pk_Bm3yO9a1RZumHNuIQJtxqg`;
  const logoResponse = await fetch(logoUrl);
  const logoBlob = await logoResponse.blob();
  
  const organization = await clerk.organizations.createOrganization({
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
    createdBy: userId,
    publicMetadata: {
      apiKey,
      source: 'discord_bot',
    }
  });

  // Upload logo after organization is created
  const formData = new FormData();
  formData.append('file', logoBlob);
  
  await clerk.organizations.updateOrganizationLogo(organization.id, {
    file: logoBlob
  });

  // Store in Supabase with error handling
  const { error } = await upsertOrganizationToSupabase({
    id: organization.id,
    created_by: userId,
    organizationName: name,
    api_key: apiKey,
    domain: domain || undefined
  });

  if (error) {
    console.error('Error upserting organization:', error);
    throw new Error('Failed to store organization data');
  }

  return organization;
}

export async function createClerkUser(
  email: string, 
  discordUserId: string, 
  firstName: string,
  lastName: string,
  domain: string,
  organizationName?: string,
  hyperlineId?: string
) {
  // Create the user first
  const user = await clerk.users.createUser({
    emailAddress: [email],
    firstName,
    lastName,
    publicMetadata: {
      source: 'discord_bot',
      domain,
      discordUserId: discordUserId
    }
  });

  // If an org name is provided, create an organization
  if (organizationName) {
    const organization = await createClerkOrganization(
      organizationName,
      user.id,
      domain
    );

    // Store user with organization ID
    await upsertUserToSupabase({
      id: user.id,
      email,
      discord_user_id: discordUserId,
      organization: organization.id,
      first_name: firstName,
      last_name: lastName,
      domain
    });

    return { user, organization };
  }

  // If no org name, just store the user
  await upsertUserToSupabase({
    id: user.id,
    email,
    discord_user_id: discordUserId,
    organization: '',
    first_name: firstName,
    last_name: lastName,
    domain
  });

  return { user };
}

export async function createHyperlineCustomer(data: {
  name: string;
  type: 'corporate' | 'person';
  currency: string;
  billing_email: string;
  organization_id: string;
}) {
  const response = await fetch('https://api.hyperline.co/v1/customers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HYPERLINE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: data.name,
      type: data.type,
      currency: data.currency,
      billing_email: data.billing_email,
      available_payment_methods: ['card', 'transfer'],
      status: 'active',
      invoice_reminders_enabled: true
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Hyperline API error:', errorData);
    throw new Error(`Failed to create customer: ${response.statusText}`);
  }

  const customer = await response.json();
  
  if (!customer?.id) {
    throw new Error('Failed to create customer: No customer ID returned');
  }

  // Update Supabase organization with Hyperline ID
  const { error } = await supabase
    .from('organizations')
    .update({ hyperline_id: customer.id })
    .eq('id', data.organization_id);

  if (error) {
    console.error('Error updating organization with Hyperline ID:', error);
    throw new Error('Failed to update organization with Hyperline ID');
  }

  return customer;
}

export async function generatePortcullisApiKey(orgId: string) {
  const randomBytes = crypto.randomBytes(32);
  const apiKey = `pk_${orgId}_${randomBytes.toString('base64url')}`;
  return apiKey;
}

export async function upsertOrganizationToSupabase(data: {
  id: string;
  created_by: string;
  domain?: string;
  organizationName?: string;
  api_key: string;
}) {
  return await supabase
    .from('organizations')
    .upsert(data, { onConflict: 'id' });
}

export async function createHyperlineQuote(data: {
  customer_id: string;
  amount: number;
  currency: string;
}) {
  const response = await fetch('https://api.hyperline.co/v1/quotes', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HYPERLINE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      customer_id: data.customer_id,
      amount: data.amount,
      currency: data.currency,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    })
  });
  
  return await response.json();
}

export async function upsertUserToSupabase(data: {
  id: string;
  email: string;
  discord_user_id: string;
  organization: string;
  first_name: string;
  last_name: string;
  domain: string;
}) {
  return await supabase
    .from('users')
    .upsert(data, { onConflict: 'id' });
}