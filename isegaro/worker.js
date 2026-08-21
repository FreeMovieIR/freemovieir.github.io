addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Set CORS headers (will be applied to all responses)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Accept-Language',
    'Access-Control-Max-Age': '86400',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', {
      status: 400,
      headers: corsHeaders,
    });
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch (err) {
    return new Response('Invalid URL', {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Only allow http and https protocols
  if (!['http:', 'https:'].includes(target.protocol)) {
    return new Response('Only http and https protocols are allowed', {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Prepare the request to the target
  const init = {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'follow',
  };

  try {
    // Fetch the target URL
    const response = await fetch(target.toString(), init);

    // Copy response headers and add CORS headers
    const responseHeaders = new Headers(response.headers);
    Object.keys(corsHeaders).forEach(key => responseHeaders.set(key, corsHeaders[key]));

    // Return the proxied response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response('Proxy error: ' + err.message, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
