# My machines: what the FPG Part Finder app and Polly need

The website side is done (Horizon draft): `sections/fpg-my-machines.liquid`,
`assets/fpg-my-machines.js`, `templates/page.my-machines.json`, and the service
finder now opens pre-filled from a link (`?machine=&brand=&model=`).

Until the app routes below exist, the page still works: machines are kept in
the customer's browser, and the page quietly falls back to that if the app
answers with an error.

## How it fits together

```
Customer's browser ──► forestparkgarden.com/apps/parts-finder/customer/...   (app proxy)
                         │  Shopify adds logged_in_customer_id + a signature
                         ▼
                 FPG Part Finder app (server)
                   ├─ reads/writes the customer metafield fpg.machines (Admin API)
                   └─ asks Polly for machines sold to that customer (server-to-server, secret key)
```

Why the app proxy: Shopify signs every proxy request and adds the signed-in
customer's id (`logged_in_customer_id`). The app checks the signature, so a
customer can only ever read or change their own list. Nothing in the browser
is trusted for who the customer is.

## 1. Customer metafield

- Namespace/key: `fpg.machines`, type `json`, owner: Customer.
- Value: an array, newest first, at most 20 items:

```json
[
  { "brand": "STIHL", "type": "Chainsaw", "model": "MS 261", "modelId": 1032, "source": "saved", "addedAt": "2026-10-23" }
]
```

`modelId` is the Part Finder app's own model id (the same ids as the parts
finder). The theme reads it in Liquid as `customer.metafields.fpg.machines.value`.

## 2. App proxy routes (in the FPG Part Finder app)

The app's proxy is already set up as `/apps/parts-finder`. Add two routes.
Example for the standard Shopify Remix app template:

```js
// app/routes/proxy.customer.machines.jsx   →  /apps/parts-finder/customer/machines
import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server';

const MAX = 20;
const clean = (list) =>
  (Array.isArray(list) ? list : []).slice(0, MAX).map((m) => ({
    brand: String(m.brand || '').slice(0, 40),
    type: String(m.type || '').slice(0, 40),
    model: String(m.model || '').slice(0, 60),
    modelId: Number.isFinite(Number(m.modelId)) ? Number(m.modelId) : undefined,
    source: 'saved',
    addedAt: /^\d{4}-\d{2}-\d{2}$/.test(m.addedAt) ? m.addedAt : new Date().toISOString().slice(0, 10),
  })).filter((m) => m.model);

export async function action({ request }) {
  const { admin } = await authenticate.public.appProxy(request); // checks Shopify's signature
  const customerId = new URL(request.url).searchParams.get('logged_in_customer_id');
  if (!admin || !customerId) return json({ error: 'Sign in first' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const machines = clean(body.machines);

  const res = await admin.graphql(
    `#graphql
    mutation Save($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) { userErrors { field message } }
    }`,
    { variables: { m: [{ ownerId: `gid://shopify/Customer/${customerId}`, namespace: 'fpg', key: 'machines', type: 'json', value: JSON.stringify(machines) }] } }
  );
  const errors = (await res.json()).data?.metafieldsSet?.userErrors || [];
  if (errors.length) return json({ error: errors[0].message }, { status: 400 });
  return json({ ok: true, machines });
}

export async function loader() {
  return json({ error: 'POST only' }, { status: 405 });
}
```

```js
// app/routes/proxy.customer.owned-machines.jsx  →  /apps/parts-finder/customer/owned-machines
import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server';

export async function loader({ request }) {
  const { admin } = await authenticate.public.appProxy(request);
  const customerId = new URL(request.url).searchParams.get('logged_in_customer_id');
  if (!admin || !customerId) return json({ machines: [] }, { status: 401 });

  // The signed-in customer's email, from Shopify (never from the browser).
  const res = await admin.graphql(`#graphql
    query { customer(id: "gid://shopify/Customer/${customerId}") { defaultEmailAddress { emailAddress } } }`);
  const email = (await res.json()).data?.customer?.defaultEmailAddress?.emailAddress;
  if (!email) return json({ machines: [] });

  const polly = await fetch(`${process.env.POLLY_URL}/internal/customer-machines?email=${encodeURIComponent(email)}`, {
    headers: { 'X-Polly-Key': process.env.POLLY_KEY },
  });
  if (!polly.ok) return json({ machines: [] });
  const data = await polly.json();
  return json({ machines: data.machines || [] }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
```

App scopes needed: `read_customers`, `write_customers` (for the metafield).
Environment: `POLLY_URL=https://polly.fpandg.com`, `POLLY_KEY=<long random secret, also set on Polly>`.

## 3. Polly: machines sold to a customer

A server-to-server route, only answering requests with the secret key
(never open to the public, and no CORS):

```
GET /internal/customer-machines?email=someone@example.com
Header: X-Polly-Key: <secret>

200 { "machines": [
  { "brand": "stihl", "name": "MS 261 C-M", "sku": "11412000646", "serial": "123456789", "soldOn": "2025-03-14" }
] }
```

Build it from what Polly already has: find the Brightpearl contact by email,
then that contact's serial-number sales (the Serial Numbers / serial sales
data), one entry per machine sold. Machines only, not parts. If the email
matches no contact, return an empty list.

The page matches each machine to the parts finder by brand and name
("MS 261 C-M" → MS 261), so "Order parts" goes straight to the right machine.

## 4. Polly: parts lists for the website (the earlier request)

```
GET /public/machine-parts?brand=stihl&sku=11412000646
Access-Control-Allow-Origin: https://forestparkgarden.com

200 { "name": "MS 261 C-M", "groups": [
  { "name": "Carburetor 1141/40, 1141/44", "parts": [
    { "ref": "9", "partNumber": "11411200640", "name": "Carburetor 1141/40", "qty": 1 }
  ] }
] }
```

Straight from `/parts/models` (the registered-models list), trimmed to what a
shopper needs: no Brightpearl ids or internal fields.

## 5. Settings in Shopify admin (when going live)

- Create a page "My machines" (handle `my-machines`) using the template
  `page.my-machines`.
- Settings > Customer accounts > menu: add a "My machines" link to
  `/pages/my-machines`, so it shows inside the account.
