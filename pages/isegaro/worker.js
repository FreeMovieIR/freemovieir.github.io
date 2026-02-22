addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // مدیریت درخواست‌های OPTIONS برای CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*', // اجازه دسترسی از همه دامنه‌ها
        'Access-Control-Allow-Methods': 'POST, OPTIONS', // متدهای مجاز
        'Access-Control-Allow-Headers': 'Content-Type', // هدرهای مجاز
        'Access-Control-Max-Age': '86400', // مدت زمان کش کردن پاسخ preflight
      },
    });
  }

  // فقط درخواست‌های POST را پردازش می‌کنیم
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // پارامترهای درخواست را استخراج می‌کنیم
  const url = new URL(request.url);
  const apiKey = url.searchParams.get('key');
  const model = url.searchParams.get('model');

  if (!apiKey || !model) {
    return new Response('Missing key or model parameter', { status: 400 });
  }

  // بدنه درخواست را می‌گیریم
  const requestBody = await request.json();

  // درخواست را به API گوگل ارسال می‌کنیم
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  // پاسخ را به کلاینت برمی‌گردانیم
  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // اجازه دسترسی از همه دامنه‌ها
    },
  });
}