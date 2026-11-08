/**
 * Automated Test Runner for Lab 3 Express.js & SQLite Books API.
 * Uses Node.js built-in fetch API to test success and failure scenarios sequentially.
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

let serverInstance = null;

async function isServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/books`, { method: 'GET' });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function startServerIfNeeded() {
  const running = await isServerRunning();
  if (running) {
    console.log(`[INFO] Server already running at ${BASE_URL}`);
    return;
  }

  process.env.NODE_ENV = 'test';
  const { initializeDB } = require('./database');
  const app = require('./app');

  await initializeDB();
  await new Promise((resolve) => {
    serverInstance = app.listen(PORT, () => {
      console.log(`[INFO] Test server started on ${BASE_URL}`);
      resolve();
    });
  });
}

async function executeTest({ name, method, path, body, expectedStatus, validate }) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);

    const statusMatch = res.status === expectedStatus;
    const customMatch = validate ? validate(data) : true;
    const passed = statusMatch && customMatch;

    if (passed) {
      console.log(`\x1b[32m✔ [PASS]\x1b[0m ${name}`);
      console.log(`        Status: ${res.status} (Expected: ${expectedStatus})`);
      console.log(`        Response:`, JSON.stringify(data));
      return true;
    } else {
      console.log(`\x1b[31m✖ [FAIL]\x1b[0m ${name}`);
      console.log(`        Status: ${res.status} (Expected: ${expectedStatus})`);
      console.log(`        Response:`, JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.log(`\x1b[31m✖ [ERROR]\x1b[0m ${name} - Network/Runtime Error: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('='.repeat(70));
  console.log(' LAB 3: AUTOMATED REST API TEST SUITE');
  console.log('='.repeat(70));

  await startServerIfNeeded();

  let passed = 0;
  let total = 0;
  let createdBookId = null;

  const testCases = [
    // 1. POST /books - Success
    {
      name: '1. POST /books - Create new book with valid payload',
      method: 'POST',
      path: '/books',
      body: { title: 'The Pragmatic Programmer', author: 'Andy Hunt', price: 42.50 },
      expectedStatus: 201,
      validate: (data) => {
        if (data && data.id) {
          createdBookId = data.id;
          return data.message === 'Book created successfully';
        }
        return false;
      },
    },

    // 2. POST /books - Missing title (400)
    {
      name: '2. POST /books - Missing title returns 400 Bad Request',
      method: 'POST',
      path: '/books',
      body: { author: 'Andy Hunt', price: 42.50 },
      expectedStatus: 400,
      validate: (data) => data && typeof data.message === 'string' && data.message.includes('Title'),
    },

    // 3. POST /books - Empty author (400)
    {
      name: '3. POST /books - Empty author string returns 400 Bad Request',
      method: 'POST',
      path: '/books',
      body: { title: 'The Mythical Man-Month', author: '   ', price: 35.00 },
      expectedStatus: 400,
      validate: (data) => data && typeof data.message === 'string' && data.message.includes('Author'),
    },

    // 4. POST /books - Negative price (400)
    {
      name: '4. POST /books - Negative price returns 400 Bad Request',
      method: 'POST',
      path: '/books',
      body: { title: 'Clean Architecture', author: 'Robert C. Martin', price: -10.00 },
      expectedStatus: 400,
      validate: (data) => data && typeof data.message === 'string' && data.message.includes('Price'),
    },

    // 5. GET /books - Default list
    {
      name: '5. GET /books - Retrieve default list (limit=10, order_by=id ASC)',
      method: 'GET',
      path: '/books',
      expectedStatus: 200,
      validate: (data) => Array.isArray(data),
    },

    // 6. GET /books - Search, filter, and sort
    {
      name: '6. GET /books - Search query, price filter, order_by price DESC',
      method: 'GET',
      path: '/books?search_q=Pragmatic&min_price=10&max_price=50&order_by=price&order=DESC',
      expectedStatus: 200,
      validate: (data) => Array.isArray(data) && data.length > 0,
    },

    // 7. GET /books - Invalid limit parameter (400)
    {
      name: '7. GET /books - Negative limit parameter returns 400 Bad Request',
      method: 'GET',
      path: '/books?limit=-5',
      expectedStatus: 400,
      validate: (data) => data && data.message.includes('limit'),
    },

    // 8. GET /books - Invalid offset parameter (400)
    {
      name: '8. GET /books - Negative offset parameter returns 400 Bad Request',
      method: 'GET',
      path: '/books?offset=-2',
      expectedStatus: 400,
      validate: (data) => data && data.message.includes('offset'),
    },

    // 9. GET /books - Inverted price range (400)
    {
      name: '9. GET /books - Inverted price range (min_price > max_price) returns 400',
      method: 'GET',
      path: '/books?min_price=100&max_price=20',
      expectedStatus: 400,
      validate: (data) => data && data.message === 'min_price cannot be greater than max_price',
    },

    // 10. GET /books - SQL Injection prevention in order_by (400)
    {
      name: '10. GET /books - Non-whitelisted order_by column returns 400',
      method: 'GET',
      path: '/books?order_by=injection_attempt',
      expectedStatus: 400,
      validate: (data) => data && data.message.includes('order_by'),
    },

    // 11. GET /books/:id - Existing ID
    {
      name: '11. GET /books/:id - Retrieve existing book by ID returns 200 OK',
      method: 'GET',
      path: () => `/books/${createdBookId || 1}`,
      expectedStatus: 200,
      validate: (data) => data && data.id !== undefined,
    },

    // 12. GET /books/:id - Non-existent ID (404)
    {
      name: '12. GET /books/:id - Non-existent ID returns 404 Not Found',
      method: 'GET',
      path: '/books/999999',
      expectedStatus: 404,
      validate: (data) => data && data.message === 'Book not found',
    },

    // 13. PUT /books/:id - Update existing record
    {
      name: '13. PUT /books/:id - Update existing book returns 200 OK',
      method: 'PUT',
      path: () => `/books/${createdBookId || 1}`,
      body: { title: 'The Pragmatic Programmer: 20th Anniversary Edition', author: 'Andy Hunt', price: 49.99 },
      expectedStatus: 200,
      validate: (data) => data && data.message === 'Book updated successfully',
    },

    // 14. PUT /books/:id - Non-existent ID (404)
    {
      name: '14. PUT /books/:id - Non-existent ID returns 404 Not Found',
      method: 'PUT',
      path: '/books/999999',
      body: { title: 'Ghost Book', author: 'Unknown', price: 10.00 },
      expectedStatus: 404,
      validate: (data) => data && data.message === 'Book not found',
    },

    // 15. PUT /books/:id - Invalid body (400)
    {
      name: '15. PUT /books/:id - Empty title in update returns 400 Bad Request',
      method: 'PUT',
      path: () => `/books/${createdBookId || 1}`,
      body: { title: '', author: 'Andy Hunt', price: 49.99 },
      expectedStatus: 400,
      validate: (data) => data && data.message.includes('Title'),
    },

    // 16. DELETE /books/:id - Existing ID (200)
    {
      name: '16. DELETE /books/:id - Delete existing book returns 200 OK',
      method: 'DELETE',
      path: () => `/books/${createdBookId || 1}`,
      expectedStatus: 200,
      validate: (data) => data && data.message === 'Book deleted successfully',
    },

    // 17. DELETE /books/:id - Non-existent ID (404)
    {
      name: '17. DELETE /books/:id - Delete non-existent ID returns 404 Not Found',
      method: 'DELETE',
      path: () => `/books/${createdBookId || 1}`,
      expectedStatus: 404,
      validate: (data) => data && data.message === 'Book not found',
    },
  ];

  for (const test of testCases) {
    total++;
    const resolvedPath = typeof test.path === 'function' ? test.path() : test.path;
    const result = await executeTest({
      ...test,
      path: resolvedPath,
    });
    if (result) passed++;
    console.log('-'.repeat(70));
  }

  console.log(`\nTEST SUMMARY: ${passed}/${total} test cases passed.`);

  if (serverInstance) {
    serverInstance.close();
  }

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});

